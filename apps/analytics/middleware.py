from django.http import HttpResponseForbidden
from django.utils import timezone
from .models import VisitLog


BOT_KEYWORDS = [
    "bot", "crawler", "spider", "slurp", "bingpreview",
    "facebookexternalhit", "googlebot", "naverbot", "yeti",
    "python-requests", "curl", "wget", "scrapy", "httpclient",
]

BLOCK_PATH_KEYWORDS = [
    "/wp-admin", "/wp-login", "/xmlrpc.php", "/.env",
    "/phpmyadmin", "/admin.php", "/server-status",
    "/boaform", "/config", "/vendor/phpunit",
    "/.git", "/shell", "/cgi-bin",
]

IGNORE_PATH_PREFIXES = [
    "/static/",
    "/media/",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
]


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def is_blocked_bot_or_attack(request):
    ua = request.META.get("HTTP_USER_AGENT", "").lower()
    path = request.path.lower()

    if not ua:
        return True, "No user-agent"

    for keyword in BOT_KEYWORDS:
        if keyword in ua:
            return True, f"Bot keyword: {keyword}"

    for keyword in BLOCK_PATH_KEYWORDS:
        if keyword in path:
            return True, f"Blocked path: {keyword}"

    return False, ""


class VisitLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        if any(path.startswith(prefix) for prefix in IGNORE_PATH_PREFIXES):
            return self.get_response(request)

        blocked, reason = is_blocked_bot_or_attack(request)

        if blocked:
            return HttpResponseForbidden("Forbidden")

        response = self.get_response(request)

        VisitLog.objects.create(
            ip_address=get_client_ip(request),
            path=path[:500],
            method=request.method,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            referer=request.META.get("HTTP_REFERER", ""),
            status_code=response.status_code,
            bot_status="human",
            reason="",
            created_at=timezone.now(),
        )

        return response