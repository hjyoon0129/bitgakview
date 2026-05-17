from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponseForbidden
from django.utils import timezone
from .models import VisitLog


GOOD_BOT_KEYWORDS = [
    # Search engines
    "googlebot",
    "google-inspectiontool",
    "adsbot-google",
    "mediapartners-google",
    "naverbot",
    "yeti",
    "bingbot",
    "bingpreview",

    # Link preview / social preview - 허용만 하고 기록은 안 함
    "facebookexternalhit",
    "kakaotalk-scrap",
    "twitterbot",
    "slackbot",
]

BAD_BOT_KEYWORDS = [
    # CLI / script tools
    "python-requests",
    "curl",
    "wget",
    "scrapy",
    "httpclient",
    "libwww-perl",
    "go-http-client",

    # scanners / attack tools
    "sqlmap",
    "nikto",
    "acunetix",
    "masscan",
    "zgrab",
    "nmap",

    # aggressive SEO / AI crawlers
    "ahrefsbot",
    "semrushbot",
    "mj12bot",
    "bytespider",
    "petalbot",
    "dotbot",
    "ccbot",
    "gptbot",
    "claudebot",
    "amazonbot",
]

BLOCK_PATH_KEYWORDS = [
    "/wp-admin",
    "/wp-login",
    "/xmlrpc.php",
    "/.env",
    "/.git",
    "/phpmyadmin",
    "/admin.php",
    "/server-status",
    "/boaform",
    "/config",
    "/vendor/phpunit",
    "/shell",
    "/cgi-bin",
    "/wordpress",
    "/wp-content",
    "/wp-includes",
    "/administrator",
    "/login.php",
    "/setup.php",
    "/install.php",
    "/backup",
    "/db.sql",
    "/dump.sql",
]

IGNORE_PATH_PREFIXES = [
    "/static/",
    "/media/",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/google331e49c0cbe99fbe.html",
]


def get_admin_prefix():
    admin_url = getattr(settings, "ADMIN_URL", "")
    if not admin_url:
        return None
    admin_url = admin_url.strip("/")
    if not admin_url:
        return None
    return f"/{admin_url}/"


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def has_keyword(value, keywords):
    value = (value or "").lower()
    return any(keyword in value for keyword in keywords)


def is_good_bot(user_agent):
    return has_keyword(user_agent, GOOD_BOT_KEYWORDS)


def is_bad_bot(user_agent):
    return has_keyword(user_agent, BAD_BOT_KEYWORDS)


def is_attack_path(path):
    return has_keyword(path, BLOCK_PATH_KEYWORDS)


def should_ignore_logging(path):
    if any(path.startswith(prefix) for prefix in IGNORE_PATH_PREFIXES):
        return True

    admin_prefix = get_admin_prefix()
    if admin_prefix and path.startswith(admin_prefix):
        return True

    return False


def is_rate_limited(ip):
    """
    같은 IP가 1분에 너무 많이 접근하면 차단.
    일반 사용자는 거의 안 걸리고, 무차별 봇 접근 방어용.
    """
    if not ip:
        return False

    key = f"visit_rate:{ip}"
    count = cache.get(key, 0) + 1
    cache.set(key, count, 60)

    return count > 90


class VisitLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or "/"
        path_lower = path.lower()
        user_agent = request.META.get("HTTP_USER_AGENT", "")
        ip = get_client_ip(request)

        # 정적 파일, robots, sitemap, 구글 인증 파일, 관리자 페이지는 기록하지 않음
        if should_ignore_logging(path_lower):
            return self.get_response(request)

        # Google / Naver / Bing 검색봇은 허용하되 DB 기록은 하지 않음
        if is_good_bot(user_agent):
            return self.get_response(request)

        # 공격성 경로는 앱 처리 전에 바로 차단, DB 기록도 하지 않음
        if is_attack_path(path_lower):
            return HttpResponseForbidden("Forbidden")

        # 명확한 나쁜 봇/스크래퍼는 바로 차단, DB 기록도 하지 않음
        if not user_agent:
            return HttpResponseForbidden("Forbidden")

        if is_bad_bot(user_agent):
            return HttpResponseForbidden("Forbidden")

        # 과도한 접근 IP 차단
        if is_rate_limited(ip):
            return HttpResponseForbidden("Too many requests")

        response = self.get_response(request)

        # 사람으로 보이는 요청만 DB 기록
        VisitLog.objects.create(
            ip_address=ip,
            path=path[:500],
            method=request.method,
            user_agent=user_agent,
            referer=request.META.get("HTTP_REFERER", ""),
            status_code=response.status_code,
            bot_status="human",
            reason="",
            created_at=timezone.now(),
        )

        return response