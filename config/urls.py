from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.shortcuts import redirect


def home_redirect(request):
    return redirect("stocks:search")


urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),

    path("accounts/", include("allauth.urls")),
    path("stocks/", include("apps.stocks.urls")),
    path("admin/", admin.site.urls),
    path("", home_redirect, name="home"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)