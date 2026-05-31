# Generated fix for BitgakView piramid server storage.
# This migration intentionally creates ONLY ChartPiramidState.
# Do not include ChartDrawingState/UserStockStorage here because those tables already exist.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("stocks", "0002_alter_stocksymbol_options_and_more"),
        ("stocks", "0003_chart_indicator_server_storage"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChartPiramidState",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "stock_code",
                    models.CharField("종목코드", db_index=True, max_length=20),
                ),
                (
                    "piramid",
                    models.JSONField("분할매수 전략 데이터", blank=True, default=dict),
                ),
                (
                    "updated_at",
                    models.DateTimeField("수정일", auto_now=True),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="bitgak_chart_piramids",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="사용자",
                    ),
                ),
            ],
            options={
                "verbose_name": "빗각뷰 분할매수 전략",
                "verbose_name_plural": "빗각뷰 분할매수 전략",
                "constraints": [
                    models.UniqueConstraint(
                        fields=("user", "stock_code"),
                        name="uniq_bitgak_chart_piramid_user_stock",
                    )
                ],
            },
        ),
    ]
