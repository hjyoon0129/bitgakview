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