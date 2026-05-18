import hashlib
import os
from urllib.parse import unquote

from django.conf import settings
from django.core.cache import cache
from django.db.models import F
from django.http import HttpResponseForbidden
from django.utils import timezone
from .models import VisitLog


GOOD_BOT_KEYWORDS = [
    "googlebot", "google-inspectiontool", "adsbot-google", "mediapartners-google",
    "naverbot", "yeti", "bingbot", "bingpreview",
    "facebookexternalhit", "kakaotalk-scrap", "twitterbot", "slackbot",
]

BAD_BOT_KEYWORDS = [
    "python-requests", "curl", "wget", "scrapy", "httpclient", "libwww-perl",
    "go-http-client", "sqlmap", "nikto", "acunetix", "masscan", "zgrab", "nmap",
    "ahrefsbot", "semrushbot", "mj12bot", "bytespider", "petalbot", "dotbot",
    "ccbot", "gptbot", "claudebot", "amazonbot",
]

BLOCK_PATH_KEYWORDS = [
    "/wp-admin", "/wp-login", "/xmlrpc.php", "/.env", "/.git", "/phpmyadmin",
    "/admin.php", "/server-status", "/boaform", "/config", "/vendor/phpunit",
    "/shell", "/cgi-bin", "/wordpress", "/wp-content", "/wp-includes",
    "/administrator", "/login.php", "/setup.php", "/install.php", "/backup",
    "/db.sql", "/dump.sql",
]

# 여기에 포함되는 경로는 아예 기록하지 않음: 서버 부하 절감 핵심
IGNORE_PATH_PREFIXES = [
    "/static/", "/media/", "/favicon.ico", "/robots.txt", "/sitemap.xml",
    "/google331e49c0cbe99fbe.html",
    "/stocks/api/",  # 차트/종목 API는 요청이 많으므로 DB 로그 제외
    "/api/",
]

IGNORE_EXTENSIONS = {
    ".css", ".js", ".map", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
    ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".mp3",
}

# 같은 IP + path + UA는 이 시간 안에는 DB에 다시 쓰지 않음
HUMAN_DEDUP_SECONDS = int(getattr(settings, "VISITLOG_HUMAN_DEDUP_SECONDS", 600))
BLOCKED_DEDUP_SECONDS = int(getattr(settings, "VISITLOG_BLOCKED_DEDUP_SECONDS", 3600))
RATE_LIMIT_PER_MINUTE = int(getattr(settings, "VISITLOG_RATE_LIMIT_PER_MINUTE", 90))


def get_admin_prefix():
    admin_url = getattr(settings, "ADMIN_URL", "")
    if not admin_url:
        return None
    admin_url = admin_url.strip("/")
    return f"/{admin_url}/" if admin_url else None


def get_client_ip(request):
    # Nginx proxy 사용 시 실제 IP 우선
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR")


def has_keyword(value, keywords):
    value = (value or "").lower()
    return any(keyword in value for keyword in keywords)


def is_good_bot(user_agent):
    return has_keyword(user_agent, GOOD_BOT_KEYWORDS)


def is_bad_bot(user_agent):
    return has_keyword(user_agent, BAD_BOT_KEYWORDS)


def is_attack_path(path):
    decoded = unquote(path or "").lower()
    return has_keyword(decoded, BLOCK_PATH_KEYWORDS)


def should_ignore_logging(path):
    path = (path or "/").lower()

    if any(path.startswith(prefix) for prefix in IGNORE_PATH_PREFIXES):
        return True

    admin_prefix = get_admin_prefix()
    if admin_prefix and path.startswith(admin_prefix.lower()):
        return True

    _, ext = os.path.splitext(path.split("?", 1)[0])
    if ext in IGNORE_EXTENSIONS:
        return True

    return False


def user_agent_hash(user_agent):
    return hashlib.sha256((user_agent or "").encode("utf-8", errors="ignore")).hexdigest()


def cache_safe_key(*parts):
    raw = ":".join(str(part or "") for part in parts)
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()


def is_rate_limited(ip):
    if not ip:
        return False
    key = f"visit_rate:{ip}"
    count = cache.get(key, 0) + 1
    cache.set(key, count, 60)
    return count > RATE_LIMIT_PER_MINUTE


def save_compact_log(*, ip, path, method, user_agent, referer, status_code, bot_status, reason, dedup_seconds):
    """
    매 요청마다 INSERT하지 않고, cache로 중복 제거 후 같은 날/같은 IP/같은 path는
    request_count와 last_seen_at만 갱신한다.
    """
    now = timezone.now()
    visit_date = timezone.localdate()
    ua_hash = user_agent_hash(user_agent)
    cache_key = "visitlog:dedup:" + cache_safe_key(ip, path, ua_hash, bot_status, visit_date)

    # cache.add는 키가 없을 때만 True. 중복 요청이면 DB 접근 자체를 안 함.
    if not cache.add(cache_key, "1", dedup_seconds):
        return

    qs = VisitLog.objects.filter(
        ip_address=ip,
        path=path[:500],
        visit_date=visit_date,
        user_agent_hash=ua_hash,
        bot_status=bot_status,
        reason=reason[:255],
    )

    updated = qs.update(
        request_count=F("request_count") + 1,
        last_seen_at=now,
        status_code=status_code,
        referer=(referer or "")[:2000],
    )

    if not updated:
        VisitLog.objects.create(
            ip_address=ip,
            path=path[:500],
            method=method[:10],
            user_agent=user_agent or "",
            user_agent_hash=ua_hash,
            referer=(referer or "")[:2000],
            status_code=status_code,
            bot_status=bot_status,
            reason=reason[:255],
            request_count=1,
            visit_date=visit_date,
            first_seen_at=now,
            last_seen_at=now,
            created_at=now,
        )


class VisitLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or "/"
        path_lower = path.lower()
        user_agent = request.META.get("HTTP_USER_AGENT", "")
        referer = request.META.get("HTTP_REFERER", "")
        ip = get_client_ip(request)

        # 정적 파일/관리자/API는 앱만 처리하고 로그 DB에는 쓰지 않음
        if should_ignore_logging(path_lower):
            return self.get_response(request)

        # 검색엔진/미리보기 봇은 SEO 때문에 허용하되 DB 기록하지 않음
        if is_good_bot(user_agent):
            return self.get_response(request)

        # 공격성 경로는 앱 진입 전에 차단. 단, IP 확인용으로 1시간에 1번만 기록.
        if is_attack_path(path_lower):
            save_compact_log(
                ip=ip, path=path, method=request.method, user_agent=user_agent,
                referer=referer, status_code=403, bot_status="suspicious",
                reason="attack_path", dedup_seconds=BLOCKED_DEDUP_SECONDS,
            )
            return HttpResponseForbidden("Forbidden")

        # UA 없는 요청/나쁜 봇은 차단. 이것도 1시간에 1번만 기록.
        if not user_agent:
            save_compact_log(
                ip=ip, path=path, method=request.method, user_agent=user_agent,
                referer=referer, status_code=403, bot_status="blocked",
                reason="empty_user_agent", dedup_seconds=BLOCKED_DEDUP_SECONDS,
            )
            return HttpResponseForbidden("Forbidden")

        if is_bad_bot(user_agent):
            save_compact_log(
                ip=ip, path=path, method=request.method, user_agent=user_agent,
                referer=referer, status_code=403, bot_status="bot",
                reason="bad_user_agent", dedup_seconds=BLOCKED_DEDUP_SECONDS,
            )
            return HttpResponseForbidden("Forbidden")

        if is_rate_limited(ip):
            save_compact_log(
                ip=ip, path=path, method=request.method, user_agent=user_agent,
                referer=referer, status_code=429, bot_status="blocked",
                reason="rate_limited", dedup_seconds=BLOCKED_DEDUP_SECONDS,
            )
            return HttpResponseForbidden("Too many requests")

        response = self.get_response(request)

        # 서버 부하 방지: 일반 페이지 GET 요청만 compact 기록
        if request.method == "GET" and response.status_code < 500:
            save_compact_log(
                ip=ip, path=path, method=request.method, user_agent=user_agent,
                referer=referer, status_code=response.status_code, bot_status="human",
                reason="", dedup_seconds=HUMAN_DEDUP_SECONDS,
            )

        return response
