from django.conf import settings
from django.db import models


class StockSymbol(models.Model):
    """빗각뷰 차트/검색에서 사용하는 국내 주식 기본 종목 마스터.

    주의:
    기존 운영 DB의 stocks_stocksymbol 테이블에는 updated_at 컬럼이 없는 상태가 확인된 적이 있습니다.
    그래서 StockSymbol에는 실제 DB 필드 updated_at을 두지 않고, 관리자/기존 코드 호환용 property만 둡니다.
    이렇게 해야 /stocks/000660/ 진입 시 updated_at 컬럼 조회 오류가 나지 않습니다.
    """

    code = models.CharField("종목코드", max_length=24, unique=True, db_index=True)
    name = models.CharField("종목명", max_length=120, db_index=True)
    market = models.CharField("시장", max_length=40, default="KOSPI", db_index=True)

    class Meta:
        ordering = ["market", "name"]
        verbose_name = "종목"
        verbose_name_plural = "종목"
        indexes = [
            models.Index(fields=["market", "name"]),
            models.Index(fields=["code"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def updated_at(self):
        """기존 admin/list_display 호환용. 실제 DB 컬럼은 만들지 않는다."""
        return None


class UserStockStorage(models.Model):
    """사용자 관심그룹/관심종목/포트폴리오/드로잉 기본속성 저장소."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="stock_storage",
        verbose_name="사용자",
    )
    groups = models.JSONField("관심그룹", default=list, blank=True)
    selected_group_id = models.CharField("선택 그룹 ID", max_length=120, blank=True, default="")
    portfolio = models.JSONField("포트폴리오", default=dict, blank=True)
    drawing_tool_defaults = models.JSONField("드로잉 도구 기본속성", default=dict, blank=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "사용자 관심종목 저장소"
        verbose_name_plural = "사용자 관심종목 저장소"

    def __str__(self):
        return f"{self.user} 관심종목"


class ChartDrawingState(models.Model):
    """사용자별/종목별 차트 드로잉 저장소."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chart_drawing_states",
        verbose_name="사용자",
    )
    stock_code = models.CharField("종목코드", max_length=40, db_index=True)
    drawings = models.JSONField("드로잉", default=list, blank=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        unique_together = ("user", "stock_code")
        indexes = [
            models.Index(fields=["user", "stock_code"]),
            models.Index(fields=["stock_code"]),
        ]
        verbose_name = "차트 드로잉"
        verbose_name_plural = "차트 드로잉"

    def __str__(self):
        return f"{self.user} / {self.stock_code}"


class ChartIndicatorState(models.Model):
    """사용자별/종목별 차트 지표 저장소."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chart_indicator_states",
        verbose_name="사용자",
    )
    stock_code = models.CharField("종목코드", max_length=40, db_index=True)
    indicators = models.JSONField("지표", default=list, blank=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        unique_together = ("user", "stock_code")
        indexes = [
            models.Index(fields=["user", "stock_code"]),
            models.Index(fields=["stock_code"]),
        ]
        verbose_name = "차트 지표"
        verbose_name_plural = "차트 지표"

    def __str__(self):
        return f"{self.user} / {self.stock_code} 지표"


class ChartPiramidState(models.Model):
    """사용자별/종목별 분할매수 전략 저장소."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chart_piramid_states",
        verbose_name="사용자",
    )
    stock_code = models.CharField("종목코드", max_length=40, db_index=True)
    piramid = models.JSONField("분할매수 전략", default=dict, blank=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        unique_together = ("user", "stock_code")
        indexes = [
            models.Index(fields=["user", "stock_code"]),
            models.Index(fields=["stock_code"]),
        ]
        verbose_name = "분할매수 전략"
        verbose_name_plural = "분할매수 전략"

    def __str__(self):
        return f"{self.user} / {self.stock_code} 분할매수"


class ScreenUsage(models.Model):
    """화면/기능 사용량 저장소. 기존 코드 import 호환용."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="screen_usages",
        null=True,
        blank=True,
        verbose_name="사용자",
    )
    screen = models.CharField("화면", max_length=80, db_index=True, default="")
    key = models.CharField("키", max_length=120, db_index=True, blank=True, default="")
    count = models.PositiveIntegerField("사용 횟수", default=0)
    last_used_at = models.DateTimeField("마지막 사용일", auto_now=True)
    created_at = models.DateTimeField("생성일", auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "screen"]),
            models.Index(fields=["screen", "key"]),
        ]
        verbose_name = "화면 사용량"
        verbose_name_plural = "화면 사용량"

    def __str__(self):
        return f"{self.screen}:{self.key} ({self.count})"


class PremiumApplication(models.Model):
    """초기 가입자 100명 프리미엄 1년 무료 혜택 신청서."""

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (STATUS_PENDING, "승인 대기"),
        (STATUS_APPROVED, "승인 완료"),
        (STATUS_REJECTED, "반려"),
        (STATUS_CANCELLED, "취소"),
    ]

    PLAN_FREE_1Y = "free_1y"
    PLAN_MONTHLY = "monthly"
    PLAN_6MONTH = "6month"

    PLAN_CHOICES = [
        (PLAN_FREE_1Y, "초기 100명 프리미엄 1년 무료"),
        (PLAN_MONTHLY, "프리미엄 월 9,900원"),
        (PLAN_6MONTH, "프리미엄 6개월 49,500원"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="premium_application",
        verbose_name="신청 사용자",
    )
    plan = models.CharField("신청 플랜", max_length=30, choices=PLAN_CHOICES, default=PLAN_FREE_1Y)
    status = models.CharField("상태", max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    user_message = models.TextField("사용자 메모", blank=True, default="")
    admin_reply = models.TextField(
        "관리자 답장",
        blank=True,
        default="",
        help_text="승인/반려 후 사용자 화면에 표시됩니다.",
    )
    source = models.CharField("신청 위치", max_length=80, blank=True, default="")
    user_agent = models.TextField("User Agent", blank=True, default="")
    requested_at = models.DateTimeField("신청일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)
    processed_at = models.DateTimeField("처리일", null=True, blank=True)
    approved_until = models.DateTimeField("프리미엄 만료 예정일", null=True, blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_premium_applications",
        verbose_name="처리 관리자",
    )

    class Meta:
        ordering = ["-requested_at"]
        verbose_name = "프리미엄 1년 무료 신청"
        verbose_name_plural = "프리미엄 1년 무료 신청 목록"
        indexes = [
            models.Index(fields=["status", "requested_at"]),
            models.Index(fields=["plan", "status"]),
        ]

    def __str__(self):
        return f"{self.user} / {self.get_status_display()}"

    @property
    def is_approved(self):
        return self.status == self.STATUS_APPROVED

    @property
    def is_pending(self):
        return self.status == self.STATUS_PENDING

    @property
    def is_rejected(self):
        return self.status == self.STATUS_REJECTED


class PremiumAccess(models.Model):
    """승인된 사용자에게 실제 프리미엄 권한을 부여하는 모델."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="premium_access",
        verbose_name="사용자",
    )
    plan = models.CharField("적용 플랜", max_length=30, choices=PremiumApplication.PLAN_CHOICES, default=PremiumApplication.PLAN_FREE_1Y)
    is_active = models.BooleanField("활성화", default=True, db_index=True)
    starts_at = models.DateTimeField("시작일", null=True, blank=True)
    ends_at = models.DateTimeField("종료일", null=True, blank=True)
    note = models.TextField("관리 메모", blank=True, default="")
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="granted_premium_accesses",
        verbose_name="승인 관리자",
    )
    created_at = models.DateTimeField("생성일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "프리미엄 이용권"
        verbose_name_plural = "프리미엄 이용권"
        indexes = [
            models.Index(fields=["is_active", "ends_at"]),
        ]

    def __str__(self):
        return f"{self.user} / {self.get_plan_display()}"

    def is_valid(self, now=None):
        from django.utils import timezone

        if not self.is_active:
            return False
        now = now or timezone.now()
        if self.starts_at and self.starts_at > now:
            return False
        if self.ends_at and self.ends_at < now:
            return False
        return True
