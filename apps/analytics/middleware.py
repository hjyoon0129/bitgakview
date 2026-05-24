import os
from urllib.parse import unquote

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponseForbidden


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

IGNORE_PATH_PREFIXES = [
    "/static/", "/media/", "/favicon.ico", "/robots.txt", "/sitemap.xml",
    "/google331e49c0cbe99fbe.html",
    "/stocks/api/",
    "/api/",
]

IGNORE_EXTENSIONS = {
    ".css", ".js", ".map", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
    ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".mp3",
}

RATE_LIMIT_PER_MINUTE = int(getattr(settings, "VISITLOG_RATE_LIMIT_PER_MINUTE", 90))


def get_admin_prefix():
    admin_url = getattr(settings, "ADMIN_URL", "")
    if not admin_url:
        return None
    admin_url = admin_url.strip("/")
    return f"/{admin_url}/" if admin_url else None


def get_client_ip(request):
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


def should_ignore_request(path):
    path = (path or "/").lower()

    if any(path.startswith(prefix) for prefix in IGNORE_PATH_PREFIXES):
        return True

    admin_prefix = get_admin_prefix()
    if admin_prefix and path.startswith(admin_prefix.lower()):
        return True

    _, ext = os.path.splitext(path.split("?", 1)[0])
    return ext in IGNORE_EXTENSIONS


def is_rate_limited(ip):
    if not ip:
        return False
    key = f"visit_rate:{ip}"
    count = cache.get(key, 0) + 1
    cache.set(key, count, 60)
    return count > RATE_LIMIT_PER_MINUTE


class VisitLogMiddleware:
    """
    VisitLog 저장 완전 비활성화 버전.

    핵심:
    - VisitLog 모델 import 안 함
    - save/create/update DB 작업 없음
    - 관리자 화면에도 VisitLog를 노출하지 않음(admin.py에서 처리)

    단, 서버 보호용 최소 차단은 유지:
    - 워드프레스/환경파일/해킹성 경로 차단
    - 명확한 bad bot UA 차단
    - IP 기준 초당성 과다 요청 rate limit 차단
    - Google/Naver/Bing 등 정상 검색봇은 허용
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or "/"
        path_lower = path.lower()
        user_agent = request.META.get("HTTP_USER_AGENT", "")
        ip = get_client_ip(request)

        # 정적 파일/API/admin 등은 아무 처리 없이 통과
        if should_ignore_request(path_lower):
            return self.get_response(request)

        # 정상 검색봇은 SEO 때문에 허용
        if is_good_bot(user_agent):
            return self.get_response(request)

        # 공격성 경로와 나쁜 봇은 차단하지만 DB에는 저장하지 않음
        if is_attack_path(path_lower):
            return HttpResponseForbidden("Forbidden")

        if not user_agent:
            return HttpResponseForbidden("Forbidden")

        if is_bad_bot(user_agent):
            return HttpResponseForbidden("Forbidden")

        if is_rate_limited(ip):
            return HttpResponseForbidden("Too many requests")

        return self.get_response(request)
