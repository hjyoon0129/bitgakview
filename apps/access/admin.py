from django.contrib import admin
from django.utils import timezone

from .models import UNLIMITED, Coupon, CouponRedemption, UserAccess


@admin.register(UserAccess)
class UserAccessAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "plan",
        "is_premium_status",
        "premium_until",
        "indicator_limit",
        "watchlist_limit",
        "group_limit",
        "drawing_limit",
        "updated_at",
    )
    list_filter = ("plan",)
    search_fields = ("user__username", "user__email")
    readonly_fields = ("created_at", "updated_at")
    actions = ["give_14_days", "give_30_days", "give_365_days", "make_unlimited", "expire_premium"]

    def is_premium_status(self, obj):
        return obj.is_premium

    is_premium_status.boolean = True
    is_premium_status.short_description = "프리미엄"

    def give_14_days(self, request, queryset):
        for obj in queryset:
            obj.activate_premium(14)

    give_14_days.short_description = "선택 사용자에게 14일 프리미엄 지급"

    def give_30_days(self, request, queryset):
        for obj in queryset:
            obj.activate_premium(30)

    give_30_days.short_description = "선택 사용자에게 30일 프리미엄 지급"

    def give_365_days(self, request, queryset):
        for obj in queryset:
            obj.activate_premium(365)

    give_365_days.short_description = "선택 사용자에게 365일 프리미엄 지급"

    def make_unlimited(self, request, queryset):
        queryset.update(
            plan=UserAccess.PLAN_PREMIUM,
            premium_until=timezone.now() + timezone.timedelta(days=3650),
            indicator_limit=UNLIMITED,
            watchlist_limit=UNLIMITED,
            group_limit=UNLIMITED,
            drawing_limit=UNLIMITED,
        )

    make_unlimited.short_description = "선택 사용자 무제한 프리미엄 10년 지급"

    def expire_premium(self, request, queryset):
        queryset.update(
            plan=UserAccess.PLAN_FREE,
            premium_until=timezone.now(),
            indicator_limit=2,
            watchlist_limit=10,
            group_limit=1,
            drawing_limit=10,
        )

    expire_premium.short_description = "선택 사용자 무료 제한으로 변경"


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ("code", "days", "is_active", "used_count", "max_uses", "starts_at", "ends_at", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "memo")
    readonly_fields = ("used_count", "created_at")


@admin.register(CouponRedemption)
class CouponRedemptionAdmin(admin.ModelAdmin):
    list_display = ("coupon", "user", "redeemed_at")
    search_fields = ("coupon__code", "user__username", "user__email")
    readonly_fields = ("coupon", "user", "redeemed_at")
