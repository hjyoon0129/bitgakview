from django.conf import settings
from django.db import models


class StockSymbol(models.Model):
    code = models.CharField("종목코드", max_length=10, unique=True, db_index=True)
    name = models.CharField("종목명", max_length=100, db_index=True)
    market = models.CharField("시장", max_length=20, default="KOSPI")

    class Meta:
        ordering = ["name"]
        verbose_name = "종목"
        verbose_name_plural = "종목"

    def __str__(self):
        return f"{self.name} ({self.code})"


class UserStockStorage(models.Model):
    """사용자별 빗각뷰 서버 저장 데이터.

    JS localStorage에만 저장되던 관심종목 그룹과 포트폴리오를
    로그인 사용자 계정 기준으로 DB에 저장하기 위한 모델입니다.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bitgak_stock_storage",
        verbose_name="사용자",
    )
    groups = models.JSONField("관심종목 그룹", default=list, blank=True)
    selected_group_id = models.CharField("선택 그룹 ID", max_length=120, blank=True, default="")
    portfolio = models.JSONField("포트폴리오", default=dict, blank=True)
    drawing_tool_defaults = models.JSONField("드로잉 도구 기본속성", default=dict, blank=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "빗각뷰 사용자 저장 데이터"
        verbose_name_plural = "빗각뷰 사용자 저장 데이터"

    def __str__(self):
        return f"{self.user} stock storage"



class ChartDrawingState(models.Model):
    """사용자·종목별 차트 드로잉 서버 저장 데이터.

    추세선, 연장선, 수평선, 수직선, 원형 표시, 피보나치 채널 등
    차트 위에 그린 모든 드로잉을 로그인 사용자 계정 기준으로 DB에 저장합니다.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bitgak_chart_drawings",
        verbose_name="사용자",
    )
    stock_code = models.CharField("종목코드", max_length=20, db_index=True)
    drawings = models.JSONField("드로잉 데이터", default=list, blank=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "빗각뷰 차트 드로잉"
        verbose_name_plural = "빗각뷰 차트 드로잉"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "stock_code"],
                name="uniq_bitgak_chart_drawing_user_stock",
            )
        ]
        indexes = [
            models.Index(fields=["user", "stock_code"]),
        ]

    def __str__(self):
        return f"{self.user} drawing {self.stock_code}"


class ChartIndicatorState(models.Model):
    """사용자·종목별 차트 지표 서버 저장 데이터.

    이동평균, 거래량, RSI, MACD, 스토캐스틱, 볼린저밴드, 일목구름 등
    차트에 적용한 지표 설정을 로그인 사용자 + 종목코드 기준으로 DB에 저장합니다.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bitgak_chart_indicators",
        verbose_name="사용자",
    )
    stock_code = models.CharField("종목코드", max_length=20, db_index=True)
    indicators = models.JSONField("지표 데이터", default=list, blank=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "빗각뷰 차트 지표"
        verbose_name_plural = "빗각뷰 차트 지표"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "stock_code"],
                name="uniq_bitgak_chart_indicator_user_stock",
            )
        ]
        indexes = [
            models.Index(fields=["user", "stock_code"]),
        ]

    def __str__(self):
        return f"{self.user} indicators {self.stock_code}"
