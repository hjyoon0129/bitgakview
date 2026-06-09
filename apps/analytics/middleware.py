import hashlib
import os
from urllib.parse import unquote

from django.conf import settings
from django.core.cache import cache
from django.db.models import F
from django.http import HttpResponse, HttpResponseForbidden
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

# 아래 경로는 통계에도 넣지 않고 rate limit 카운트에도 넣지 않음.
# 차트/자동저장/API 요청은 한 화면에서 짧은 시간에 많이 발생하므로
# 방문자 분석용 미들웨어에서 제외해야 정상 사용자가 막히지 않는다.
IGNORE_PATH_PREFIXES = [
    "/static/",
    "/media/",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/google331e49c0cbe99fbe.html",

    # 주식/차트 API
    "/stocks/api/",

    # 인사이트 차트 자동저장/드래프트 API
    # 예: /insights/api/chart-draft/
    "/insights/api/",

    # 그 외 공통 API
    "/api/",
]

IGNORE_EXTENSIONS = {
    ".css", ".js", ".map", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
    ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".mp3",
}

# 원시 로그를 저장하지 않고, 같은 IP+경로는 일정 시간에 1번만 집계 카운트 증가
HUMAN_AGG_DEDUP_SECONDS = int(getattr(settings, "VISITLOG_HUMAN_DEDUP_SECONDS", 600))
BLOCKED_AGG_DEDUP_SECONDS = int(getattr(settings, "VISITLOG_BLOCKED_DEDUP_SECONDS", 3600))

# 사람 페이지 기준 1분 요청 제한.
# API 요청은 IGNORE_PATH_PREFIXES에서 먼저 제외되므로 여기에 포함되지 않음.
RATE_LIMIT_PER_MINUTE = int(getattr(settings, "VISITLOG_RATE_LIMIT_PER_MINUTE", 90))

AGG_HASH = "__aggregate__"
PATH_SUMMARY = "__summary__"
PATH_UNIQUE = "__unique_visitors__"


def get_admin_prefix():
    admin_url = getattr(settings, "ADMIN_URL", "")
    if not admin_url:
        return None
    admin_url = admin_url.strip("/")
    return f"/{admin_url}/" if admin_url else None


def get_client_ip(request):
    # DB에는 저장하지 않고, 캐시 중복 제거/rate limit 판단에만 사용
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
    return ext in IGNORE_EXTENSIONS


def normalize_path_for_stats(path):
    """
    raw URL 전체가 아니라 통계용 path만 저장한다.
    쿼리스트링은 제거하고, 너무 다양한 숫자 URL은 그대로 두되 IP/UA/Referer는 저장하지 않는다.
    """
    normalized = (path or "/").split("?", 1)[0]
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    return normalized[:500]


def cache_safe_key(*parts):
    raw = ":".join(str(part or "") for part in parts)
    return hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest()


def is_rate_limited(ip):
    """
    IP 기준 간단한 1분 rate limit.

    기존 코드처럼 매 요청마다 cache.set(..., 60)을 하면 TTL이 계속 연장되어
    사용자가 짧게 많이 요청한 뒤에도 제한 시간이 밀릴 수 있다.
    cache.add로 최초 TTL을 고정하고, 이후에는 incr로 카운트만 증가시킨다.
    """
    if not ip:
        return False

    key = f"visit_rate:{ip}"

    # 최초 요청이면 1분 TTL로 시작
    if cache.add(key, 1, 60):
        return False

    try:
        count = cache.incr(key)
    except ValueError:
        # 캐시 백엔드 타이밍 문제로 키가 사라진 경우 안전하게 재생성
        cache.set(key, 1, 60)
        return False

    return count > RATE_LIMIT_PER_MINUTE


def increment_aggregate_row(*, path, bot_status, reason="", status_code=None, count=1):
    """
    VisitLog 테이블을 raw log가 아니라 집계 테이블처럼 사용한다.

    저장되는 것:
    - 날짜
    - 집계용 path 또는 __summary__/__unique_visitors__
    - bot_status
    - request_count

    저장하지 않는 것:
    - IP 주소
    - User-Agent 원문
    - Referer 원문
    - 개별 접속 row
    """
    now = timezone.now()
    visit_date = timezone.localdate()
    path = path[:500]
    reason = (reason or "")[:255]

    qs = VisitLog.objects.filter(
        ip_address__isnull=True,
        path=path,
        visit_date=visit_date,
        user_agent_hash=AGG_HASH,
        bot_status=bot_status,
        reason=reason,
    )

    updated = qs.update(
        request_count=F("request_count") + count,
        last_seen_at=now,
        status_code=status_code,
    )

    if not updated:
        VisitLog.objects.create(
            ip_address=None,
            path=path,
            method="AGG",
            user_agent="",
            user_agent_hash=AGG_HASH,
            referer="",
            status_code=status_code,
            bot_status=bot_status,
            reason=reason,
            request_count=count,
            visit_date=visit_date,
            first_seen_at=now,
            last_seen_at=now,
            created_at=now,
        )


def record_aggregate_visit(*, ip, path, bot_status, reason="", status_code=None, dedup_seconds=600):
    today = timezone.localdate()
    stats_path = normalize_path_for_stats(path)

    # raw IP는 DB에 저장하지 않고 캐시에만 잠깐 사용
    dedup_key = "visitagg:dedup:" + cache_safe_key(ip, stats_path, bot_status, reason, today)
    if not cache.add(dedup_key, "1", dedup_seconds):
        return

    # 전체 유형별 집계
    increment_aggregate_row(
        path=PATH_SUMMARY,
        bot_status=bot_status,
        reason=reason,
        status_code=status_code,
    )

    # 경로별 집계. IP/UA는 저장하지 않음.
    increment_aggregate_row(
        path=stats_path,
        bot_status=bot_status,
        reason=reason,
        status_code=status_code,
    )

    # 사람 방문자는 오늘 unique만 캐시로 판단해서 숫자만 저장
    if bot_status == "human" and ip:
        unique_key = "visitagg:unique:" + cache_safe_key(ip, today)
        if cache.add(unique_key, "1", 60 * 60 * 24 * 2):
            increment_aggregate_row(
                path=PATH_UNIQUE,
                bot_status="human",
                reason="unique",
                status_code=status_code,
            )


class VisitLogMiddleware:
    """
    raw VisitLog 저장 방지 버전.

    - IP / User-Agent / Referer 원문을 DB에 저장하지 않음
    - 개별 요청 row를 계속 쌓지 않음
    - VisitLog 관리자에서는 집계 통계만 볼 수 있음
    - 봇/공격 경로 차단은 유지
    - API/정적파일/차트 자동저장 요청은 방문 통계와 rate limit에서 제외
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or "/"
        path_lower = path.lower()
        user_agent = request.META.get("HTTP_USER_AGENT", "")
        ip = get_client_ip(request)

        # 통계 제외 경로는 rate limit도 적용하지 않음.
        # /insights/api/chart-draft/ 같은 자동저장 API가 여기서 빠져야
        # 정상 사용자가 Too many requests로 막히지 않는다.
        if should_ignore_logging(path_lower):
            return self.get_response(request)

        # 정상 검색봇은 SEO 때문에 허용하되 DB 집계에도 넣지 않음
        if is_good_bot(user_agent):
            return self.get_response(request)

        # 공격성 경로/나쁜 봇은 차단하고, raw가 아닌 집계 카운트만 증가
        if is_attack_path(path_lower):
            record_aggregate_visit(
                ip=ip,
                path=path,
                bot_status="suspicious",
                reason="attack_path",
                status_code=403,
                dedup_seconds=BLOCKED_AGG_DEDUP_SECONDS,
            )
            return HttpResponseForbidden("Forbidden")

        if not user_agent:
            record_aggregate_visit(
                ip=ip,
                path=path,
                bot_status="blocked",
                reason="empty_user_agent",
                status_code=403,
                dedup_seconds=BLOCKED_AGG_DEDUP_SECONDS,
            )
            return HttpResponseForbidden("Forbidden")

        if is_bad_bot(user_agent):
            record_aggregate_visit(
                ip=ip,
                path=path,
                bot_status="bot",
                reason="bad_user_agent",
                status_code=403,
                dedup_seconds=BLOCKED_AGG_DEDUP_SECONDS,
            )
            return HttpResponseForbidden("Forbidden")

        if is_rate_limited(ip):
            record_aggregate_visit(
                ip=ip,
                path=path,
                bot_status="blocked",
                reason="rate_limited",
                status_code=429,
                dedup_seconds=BLOCKED_AGG_DEDUP_SECONDS,
            )
            return HttpResponse("Too many requests", status=429)

        response = self.get_response(request)

        if request.method == "GET" and response.status_code < 500:
            record_aggregate_visit(
                ip=ip,
                path=path,
                bot_status="human",
                reason="",
                status_code=response.status_code,
                dedup_seconds=HUMAN_AGG_DEDUP_SECONDS,
            )

        return response
