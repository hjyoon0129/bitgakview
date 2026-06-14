from django.urls import path

from . import views

app_name = "access"

urlpatterns = [
    # 쿠폰 등록 API
    path("api/redeem-coupon/", views.redeem_coupon, name="redeem_coupon"),

    # 초기 100명 프리미엄 1년 무료 신청 API
    path("api/premium-application/apply/", views.premium_application_apply, name="premium_application_apply"),
    path("api/premium-application/status/", views.premium_application_status, name="premium_application_status"),
    path("api/premium-application/ack/", views.premium_application_ack, name="premium_application_ack"),

    # 과거 패치/템플릿 호환용 별칭 URL
    path("premium/apply/", views.premium_application_apply, name="premium_application_apply_legacy"),
    path("premium/status/", views.premium_application_status, name="premium_application_status_legacy"),
    path("premium/ack/", views.premium_application_ack, name="premium_application_ack_legacy"),
]
