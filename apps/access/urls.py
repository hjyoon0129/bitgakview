from django.urls import path

from . import views


app_name = "access"

urlpatterns = [
    path("api/me/", views.api_access_me, name="api_access_me"),
    path("api/redeem-coupon/", views.api_redeem_coupon, name="api_redeem_coupon"),
]
