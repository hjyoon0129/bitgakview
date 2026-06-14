from django.apps import AppConfig


class StockScreenerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.stock_screener"
    label = "stock_screener"
    verbose_name = "조건별 종목 찾기"
