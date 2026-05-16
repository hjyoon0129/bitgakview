from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.shortcuts import redirect
from django.urls import include, path


def robots_txt(request):
    lines = [
        "User-agent: *",
        "Allow: /",
        "Sitemap: /sitemap.xml",
    ]
    return HttpResponse("\n".join(lines), content_type="text/plain")


def root_redirect(request):
    # namespace 문제 방지를 위해 문자열 경로로 직접 이동
    return redirect("/stocks/")


urlpatterns = [
    path("", root_redirect, name="home"),

    path(settings.ADMIN_URL, admin.site.urls),

    path("robots.txt", robots_txt, name="robots_txt"),

    # BitgakView 커스텀 로그인/회원가입
    path("accounts/", include("apps.accounts.urls")),

    # django-allauth 소셜 로그인
    path("accounts/", include("allauth.urls")),

    # stocks
    path("stocks/", include("apps.stocks.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)