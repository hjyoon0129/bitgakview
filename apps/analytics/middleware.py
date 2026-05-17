import re
from django.utils import timezone
from .models import VisitLog


BOT_KEYWORDS = [
    "bot", "crawler", "spider", "slurp", "bingpreview",
    "facebookexternalhit", "googlebot", "naverbot",
    "yeti", "daum", "kakaotalk-scrap", "python-requests",
    "curl", "wget", "scrapy", "httpclient",
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


def detect_bot_status(request, ip):
    ua = request.META.get("HTTP_USER_AGENT", "").lower()
    path = request.path.lower()

    if not ua:
        return "suspicious", "No user-agent"

    for keyword in BOT_KEYWORDS:
        if keyword in ua:
            return "bot", f"Bot keyword: {keyword}"

    suspicious_patterns = [
        "/wp-admin",
        "/wp-login",
        "/xmlrpc.php",
        "/.env",
        "/phpmyadmin",
        "/admin.php",
        "/config",
        "/server-status",
        "/boaform",
    ]

    for pattern in suspicious_patterns:
        if pattern in path:
            return "suspicious", f"Suspicious path: {pattern}"

    return "human", ""


class VisitLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        path = request.path

        if any(path.startswith(prefix) for prefix in IGNORE_PATH_PREFIXES):
            return response

        ip = get_client_ip(request)
        bot_status, reason = detect_bot_status(request, ip)

        VisitLog.objects.create(
            ip_address=ip,
            path=path[:500],
            method=request.method,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            referer=request.META.get("HTTP_REFERER", ""),
            status_code=response.status_code,
            bot_status=bot_status,
            reason=reason,
            created_at=timezone.now(),
        )

        return response