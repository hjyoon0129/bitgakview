from django.contrib import admin, messages
from django.utils import timezone

from .models import UNLIMITED, Coupon, CouponRedemption, PremiumApplication, UserAccess


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


@admin.register(PremiumApplication)
class PremiumApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "plan",
        "status",
        "access_status",
        "source",
        "created_at",
        "approved_at",
        "notice_seen_at",
    )
    list_filter = ("status", "plan", "source", "created_at")
    search_fields = ("user__username", "user__email", "user_message", "admin_reply", "source")
    readonly_fields = (
        "created_at",
        "updated_at",
        "approved_at",
        "approved_by",
        "notice_seen_at",
        "user_agent",
        "access_status",
    )
    fieldsets = (
        ("신청 정보", {"fields": ("user", "plan", "status", "source", "user_message", "user_agent")}),
        (
            "관리자 처리",
            {
                "fields": ("admin_reply", "approved_by", "approved_at", "notice_seen_at", "access_status"),
                "description": "상태를 승인 완료로 저장하면 실제 UserAccess가 프리미엄으로 전환되고, 사용자 로그인 시 답장 모달이 표시됩니다.",
            },
        ),
        ("기록", {"fields": ("created_at", "updated_at")}),
    )
    actions = ["approve_365_days", "reject_selected", "reset_notice", "delete_selected"]

    def access_status(self, obj):
        access = getattr(obj.user, "access", None)
        if not access:
            return "이용권 없음"
        if access.is_premium:
            until = access.premium_until.strftime("%Y-%m-%d %H:%M") if access.premium_until else "무기한"
            return f"프리미엄 / 만료 {until}"
        return "무료"

    access_status.short_description = "실제 사용자 이용권"

    def save_model(self, request, obj, form, change):
        old_status = None
        if change and obj.pk:
            try:
                old_status = PremiumApplication.objects.get(pk=obj.pk).status
            except PremiumApplication.DoesNotExist:
                old_status = None

        if obj.status == PremiumApplication.STATUS_APPROVED:
            if not obj.admin_reply:
                obj.admin_reply = obj.default_reply()
            if not obj.approved_at:
                obj.approved_at = timezone.now()
            if request.user.is_authenticated and not obj.approved_by:
                obj.approved_by = request.user
            # 승인 저장 시 사용자에게 모달을 다시 띄우도록 초기화
            obj.notice_seen_at = None

        elif obj.status == PremiumApplication.STATUS_REJECTED:
            if not obj.admin_reply:
                obj.admin_reply = obj.default_reply()
            obj.notice_seen_at = None

        super().save_model(request, obj, form, change)

        if obj.status == PremiumApplication.STATUS_APPROVED and old_status != PremiumApplication.STATUS_APPROVED:
            obj.activate_user_access(days=365, approved_by=request.user)
            self.message_user(request, f"{obj.user} 사용자에게 프리미엄 365일을 지급했습니다.", messages.SUCCESS)

    @admin.action(description="선택 신청을 승인하고 프리미엄 1년 지급")
    def approve_365_days(self, request, queryset):
        count = 0
        for obj in queryset.select_related("user"):
            obj.activate_user_access(days=365, approved_by=request.user)
            count += 1
        self.message_user(request, f"{count}건을 승인하고 프리미엄 365일을 지급했습니다.", messages.SUCCESS)

    @admin.action(description="선택 신청 반려")
    def reject_selected(self, request, queryset):
        count = 0
        for obj in queryset.select_related("user"):
            obj.status = PremiumApplication.STATUS_REJECTED
            if not obj.admin_reply:
                obj.admin_reply = obj.default_reply()
            obj.notice_seen_at = None
            obj.save(update_fields=["status", "admin_reply", "notice_seen_at", "updated_at"])
            count += 1
        self.message_user(request, f"{count}건을 반려 처리했습니다.", messages.WARNING)

    @admin.action(description="사용자 모달 다시 띄우기")
    def reset_notice(self, request, queryset):
        updated = queryset.update(notice_seen_at=None)
        self.message_user(request, f"{updated}건의 사용자 모달 확인 상태를 초기화했습니다.", messages.INFO)


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
