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
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "빗각뷰 사용자 저장 데이터"
        verbose_name_plural = "빗각뷰 사용자 저장 데이터"

    def __str__(self):
        return f"{self.user} stock storage"
