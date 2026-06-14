from django.conf import settings
from django.db import models
from django.utils import timezone

UNLIMITED = 999999


class UserAccess(models.Model):
    PLAN_FREE = "free"
    PLAN_PREMIUM = "premium"
    PLAN_CHOICES = (
        (PLAN_FREE, "무료"),
        (PLAN_PREMIUM, "프리미엄"),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="access",
        verbose_name="사용자",
    )
    plan = models.CharField("요금제", max_length=20, choices=PLAN_CHOICES, default=PLAN_FREE)
    premium_until = models.DateTimeField("프리미엄 만료일", null=True, blank=True)
    indicator_limit = models.PositiveIntegerField("지표 제한", default=2)
    watchlist_limit = models.PositiveIntegerField("관심종목 제한", default=10)
    group_limit = models.PositiveIntegerField("종목그룹 제한", default=1)
    drawing_limit = models.PositiveIntegerField("드로잉 저장 제한", default=10)
    created_at = models.DateTimeField("생성일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "사용자 이용권"
        verbose_name_plural = "사용자 이용권"

    def __str__(self):
        return f"{self.user} / {self.get_plan_display()}"

    @property
    def is_premium(self):
        if self.plan != self.PLAN_PREMIUM:
            return False
        if not self.premium_until:
            return True
        return self.premium_until > timezone.now()

    def activate_premium(self, days=365, unlimited=True, save=True):
        now = timezone.now()
        base_time = self.premium_until if self.premium_until and self.premium_until > now else now

        self.plan = self.PLAN_PREMIUM
        self.premium_until = base_time + timezone.timedelta(days=int(days or 365))

        if unlimited:
            self.indicator_limit = UNLIMITED
            self.watchlist_limit = UNLIMITED
            self.group_limit = UNLIMITED
            self.drawing_limit = UNLIMITED

        if save:
            self.save(
                update_fields=[
                    "plan",
                    "premium_until",
                    "indicator_limit",
                    "watchlist_limit",
                    "group_limit",
                    "drawing_limit",
                    "updated_at",
                ]
            )
        return self

    def expire_premium(self, save=True):
        self.plan = self.PLAN_FREE
        self.premium_until = timezone.now()
        self.indicator_limit = 2
        self.watchlist_limit = 10
        self.group_limit = 1
        self.drawing_limit = 10

        if save:
            self.save(
                update_fields=[
                    "plan",
                    "premium_until",
                    "indicator_limit",
                    "watchlist_limit",
                    "group_limit",
                    "drawing_limit",
                    "updated_at",
                ]
            )
        return self


class Coupon(models.Model):
    code = models.CharField("쿠폰 코드", max_length=80, unique=True)
    days = models.PositiveIntegerField("지급 일수", default=30)
    is_active = models.BooleanField("활성", default=True)
    used_count = models.PositiveIntegerField("사용 횟수", default=0)
    max_uses = models.PositiveIntegerField("최대 사용 횟수", default=1)
    starts_at = models.DateTimeField("시작일", null=True, blank=True)
    ends_at = models.DateTimeField("종료일", null=True, blank=True)
    memo = models.TextField("메모", blank=True)
    created_at = models.DateTimeField("생성일", auto_now_add=True)

    class Meta:
        verbose_name = "프리미엄 쿠폰"
        verbose_name_plural = "프리미엄 쿠폰"

    def __str__(self):
        return self.code

    def is_usable(self):
        now = timezone.now()
        if not self.is_active:
            return False
        if self.max_uses and self.used_count >= self.max_uses:
            return False
        if self.starts_at and self.starts_at > now:
            return False
        if self.ends_at and self.ends_at < now:
            return False
        return True


class CouponRedemption(models.Model):
    coupon = models.ForeignKey(
        Coupon,
        on_delete=models.PROTECT,
        related_name="redemptions",
        verbose_name="쿠폰",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="coupon_redemptions",
        verbose_name="사용자",
    )
    redeemed_at = models.DateTimeField("등록일", auto_now_add=True)

    class Meta:
        verbose_name = "쿠폰 사용내역"
        verbose_name_plural = "쿠폰 사용내역"
        unique_together = ("coupon", "user")

    def __str__(self):
        return f"{self.coupon.code} / {self.user}"


class PremiumApplication(models.Model):
    PLAN_FREE_365 = "free_365"
    PLAN_MONTHLY = "monthly_9900"
    PLAN_6MONTH = "six_month_49500"
    PLAN_CHOICES = (
        (PLAN_FREE_365, "초기 100명 프리미엄 1년 무료"),
        (PLAN_MONTHLY, "프리미엄 월 9,900원"),
        (PLAN_6MONTH, "프리미엄 6개월 49,500원"),
    )

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (STATUS_PENDING, "승인 대기"),
        (STATUS_APPROVED, "승인 완료"),
        (STATUS_REJECTED, "반려"),
        (STATUS_CANCELLED, "취소"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="premium_applications",
        verbose_name="신청 사용자",
    )
    plan = models.CharField("신청 플랜", max_length=32, choices=PLAN_CHOICES, default=PLAN_FREE_365)
    status = models.CharField("상태", max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    source = models.CharField("신청 위치", max_length=120, blank=True)
    user_message = models.TextField("사용자 메모", blank=True)
    admin_reply = models.TextField(
        "관리자 답장",
        blank=True,
        default="",
        help_text="승인/반려 후 사용자가 로그인하면 이 내용이 모달로 표시됩니다.",
    )
    user_agent = models.TextField("User Agent", blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_premium_applications",
        verbose_name="승인 관리자",
    )
    approved_at = models.DateTimeField("승인일", null=True, blank=True)
    notice_seen_at = models.DateTimeField("사용자 확인일", null=True, blank=True)
    created_at = models.DateTimeField("신청일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "프리미엄 1년 무료 신청"
        verbose_name_plural = "프리미엄 1년 무료 신청"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.user} / {self.get_status_display()}"

    @property
    def is_notice_unread(self):
        return self.status in {self.STATUS_APPROVED, self.STATUS_REJECTED} and self.notice_seen_at is None

    def default_reply(self):
        if self.status == self.STATUS_APPROVED:
            return "축하합니다. 초기 100명 프리미엄 1년 무료 혜택이 승인되었습니다."
        if self.status == self.STATUS_REJECTED:
            return "프리미엄 신청이 반려되었습니다. 자세한 내용은 관리자 답장을 확인해주세요."
        if self.status == self.STATUS_CANCELLED:
            return "프리미엄 신청이 취소되었습니다."
        return "프리미엄 신청이 접수되었습니다. 승인 후 안내드리겠습니다."

    def activate_user_access(self, days=365, approved_by=None):
        access, _ = UserAccess.objects.get_or_create(user=self.user)
        access.activate_premium(days=days)

        self.status = self.STATUS_APPROVED
        if approved_by and getattr(approved_by, "is_authenticated", False):
            self.approved_by = approved_by
        if not self.approved_at:
            self.approved_at = timezone.now()
        if not self.admin_reply:
            self.admin_reply = self.default_reply()
        # 승인 후 사용자에게 다시 모달을 띄우기 위해 확인일 초기화
        self.notice_seen_at = None
        self.save(
            update_fields=[
                "status",
                "approved_by",
                "approved_at",
                "admin_reply",
                "notice_seen_at",
                "updated_at",
            ]
        )
        return access
