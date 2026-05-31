# Generated for BitgakView server-side chart indicator storage.
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("stocks", "0002_chart_drawing_server_storage"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChartIndicatorState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("stock_code", models.CharField(db_index=True, max_length=20, verbose_name="종목코드")),
                ("indicators", models.JSONField(blank=True, default=list, verbose_name="지표 데이터")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="수정일")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bitgak_chart_indicators", to=settings.AUTH_USER_MODEL, verbose_name="사용자")),
            ],
            options={
                "verbose_name": "빗각뷰 차트 지표",
                "verbose_name_plural": "빗각뷰 차트 지표",
                "indexes": [models.Index(fields=["user", "stock_code"], name="stocks_char_user_id_6a8f_idx")],
                "constraints": [models.UniqueConstraint(fields=("user", "stock_code"), name="uniq_bitgak_chart_indicator_user_stock")],
            },
        ),
    ]
