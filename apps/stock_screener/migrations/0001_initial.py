# Generated for BitgakView stock_screener app

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ScreenerUsage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(db_index=True)),
                ("count", models.PositiveIntegerField(default=0)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="screener_usages", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "조건검색 사용량",
                "verbose_name_plural": "조건검색 사용량",
                "indexes": [models.Index(fields=["user", "date"], name="stock_scree_user_id_9ba8ee_idx")],
                "unique_together": {("user", "date")},
            },
        ),
    ]
