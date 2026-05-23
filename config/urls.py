from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.shortcuts import redirect
from django.urls import include, path


def google_site_verification(request):
    return HttpResponse(
        "google-site-verification: google331e49c0cbe99fbe.html",
        content_type="text/plain; charset=utf-8",
    )


def robots_txt(request):
    lines = [
        "# BitgakView robots.txt",
        "",
        "# Google search",
        "User-agent: Googlebot",
        "Allow: /",
        "",
        "# Google Search Console inspection",
        "User-agent: Google-InspectionTool",
        "Allow: /",
        "",
        "# Naver search",
        "User-agent: Yeti",
        "Allow: /",
        "",
        "User-agent: NaverBot",
        "Allow: /",
        "",
        "# Bing search",
        "User-agent: Bingbot",
        "Allow: /",
        "",
        "# Default crawlers",
        "User-agent: *",
        "Allow: /",
        "Disallow: /accounts/",
        "Disallow: /support/",
        "Disallow: /access/",
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
    <loc>https://bitgakview.com/stocks/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/features/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/pricing/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/005930/</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/000660/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/035420/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://bitgakview.com/stocks/035720/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
"""
    return HttpResponse(xml, content_type="application/xml; charset=utf-8")


def root_redirect(request):
    return redirect("/stocks/")


urlpatterns = [
    path("", root_redirect, name="home"),

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

    # support / access
    path("support/", include("apps.support.urls", namespace="support")),
    path("access/", include("apps.access.urls")),
    path("insights/", include("apps.insights.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)