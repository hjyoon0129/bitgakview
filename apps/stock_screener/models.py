from django.conf import settings
from django.db import models


class ScreenerUsage(models.Model):
    """무료 회원의 조건검색 일 사용량을 저장한다."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="screener_usages")
    date = models.DateField(db_index=True)
    count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "date")
        indexes = [models.Index(fields=["user", "date"])]
        verbose_name = "조건검색 사용량"
        verbose_name_plural = "조건검색 사용량"

    def __str__(self):
        return f"{self.user_id} / {self.date} / {self.count}"
