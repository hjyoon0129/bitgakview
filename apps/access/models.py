from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


UNLIMITED = 999999


class UserAccess(models.Model):
    PLAN_FREE = "free"
    PLAN_PREMIUM = "premium"

    PLAN_CHOICES = [
        (PLAN_FREE, "무료"),
        (PLAN_PREMIUM, "프리미엄"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bitgak_access",
        verbose_name="사용자",
    )
    plan = models.CharField("요금제", max_length=20, choices=PLAN_CHOICES, default=PLAN_FREE)
    premium_until = models.DateTimeField("프리미엄 만료일", null=True, blank=True)

    # 무료 기본 제한값
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
        return f"{self.user} - {self.get_plan_display()}"

    @property
    def is_premium(self):
        return bool(
            self.plan == self.PLAN_PREMIUM
            and self.premium_until
            and self.premium_until > timezone.now()
        )

    def apply_free_limits(self, save=True):
        self.plan = self.PLAN_FREE
        self.indicator_limit = 2
        self.watchlist_limit = 10
        self.group_limit = 1
        self.drawing_limit = 10
        if save:
            self.save(update_fields=[
                "plan", "indicator_limit", "watchlist_limit", "group_limit", "drawing_limit", "updated_at"
            ])

    def activate_premium(self, days):
        now = timezone.now()
        base = self.premium_until if self.premium_until and self.premium_until > now else now
        self.plan = self.PLAN_PREMIUM
        self.premium_until = base + timedelta(days=int(days))

        # 유료/쿠폰 사용자는 사실상 무제한
        self.indicator_limit = UNLIMITED
        self.watchlist_limit = UNLIMITED
        self.group_limit = UNLIMITED
        self.drawing_limit = UNLIMITED
        self.save()

    def expire_premium(self):
        self.plan = self.PLAN_FREE
        self.premium_until = timezone.now()
        self.indicator_limit = 2
        self.watchlist_limit = 10
        self.group_limit = 1
        self.drawing_limit = 10
        self.save()


class Coupon(models.Model):
    code = models.CharField("쿠폰 코드", max_length=50, unique=True)
    days = models.PositiveIntegerField("지급 일수", default=14)
    max_uses = models.PositiveIntegerField("최대 사용 횟수", default=1, help_text="0이면 무제한 사용")
    used_count = models.PositiveIntegerField("사용 횟수", default=0)
    is_active = models.BooleanField("활성화", default=True)
    starts_at = models.DateTimeField("시작일", null=True, blank=True)
    ends_at = models.DateTimeField("종료일", null=True, blank=True)
    memo = models.CharField("메모", max_length=200, blank=True)
    created_at = models.DateTimeField("생성일", auto_now_add=True)

    class Meta:
        verbose_name = "프리미엄 쿠폰"
        verbose_name_plural = "프리미엄 쿠폰"

    def __str__(self):
        return self.code

    def can_use(self):
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
    coupon = models.ForeignKey(Coupon, on_delete=models.CASCADE, related_name="redemptions", verbose_name="쿠폰")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coupon_redemptions", verbose_name="사용자")
    redeemed_at = models.DateTimeField("사용일", auto_now_add=True)

    class Meta:
        verbose_name = "쿠폰 사용내역"
        verbose_name_plural = "쿠폰 사용내역"
        unique_together = ("coupon", "user")

    def __str__(self):
        return f"{self.user} - {self.coupon.code}"
