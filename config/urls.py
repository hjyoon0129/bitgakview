from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.shortcuts import redirect
from django.urls import include, path, resolve


def google_site_verification(request):
    return HttpResponse(
        "google-site-verification: google331e49c0cbe99fbe.html",
        content_type="text/plain; charset=utf-8",
    )


def robots_txt(request):
    lines = [
        "# BitgakView robots.txt",
        "",
        "User-agent: *",
        "Allow: /",
        "",
        "# Private / system pages",
        "Disallow: /admin/",
        "Disallow: /accounts/",
        "Disallow: /stocks/api/",
        "Disallow: /api/",
        "",
        "Sitemap: https://bitgakview.com/sitemap.xml",
    ]
    return HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")


def sitemap_xml(request):
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://bitgakview.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/insights/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/features/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/pricing/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/005930/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/000660/</loc>
    <changefreq>daily</changefreq>
    <priority>0.75</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/035420/</loc>
    <changefreq>daily</changefreq>
    <priority>0.75</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/035720/</loc>
    <changefreq>daily</changefreq>
    <priority>0.75</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/005380/</loc>
    <changefreq>daily</changefreq>
    <priority>0.75</priority>
  </url>
</urlset>
"""
    return HttpResponse(xml, content_type="application/xml; charset=utf-8")


def home_view(request):
    """
    대표 메인 주소는 https://bitgakview.com/ 로 사용한다.
    다만 기존 메인 화면은 apps.stocks.urls 의 /stocks/ 화면을 그대로 재사용한다.

    이렇게 하면:
    - / 는 실제 메인 화면으로 동작
    - /stocks/ 는 기존 기능 호환용으로 유지
    - sitemap/canonical 기준 대표 URL은 / 로 통일 가능
    """
    match = resolve("/stocks/")
    return match.func(request, *match.args, **match.kwargs)


urlpatterns = [
    path("", home_view, name="home"),

    # Google Search Console HTML file verification
    path(
        "google331e49c0cbe99fbe.html",
        google_site_verification,
        name="google_site_verification",
    ),

    # SEO
    path("robots.txt", robots_txt, name="robots_txt"),
    path("sitemap.xml", sitemap_xml, name="sitemap_xml"),

    # Admin
    path(settings.ADMIN_URL, admin.site.urls),

    # BitgakView custom login/signup
    path("accounts/", include("apps.accounts.urls")),

    # django-allauth social login
    path("accounts/", include("allauth.urls")),

    # stocks
    path("stocks/", include("apps.stocks.urls")),

    # support / access / insights
    path("support/", include("apps.support.urls", namespace="support")),
    path("access/", include("apps.access.urls")),
    path("insights/", include("apps.insights.urls")),

    # tools
    path("tools/youtube-keyword/", include("apps.youtube_keyword.urls")),

    path("tools/stock-screener/", include("apps.stock_screener.urls")),

]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)