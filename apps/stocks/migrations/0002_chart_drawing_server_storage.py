# 로컬 전용 no-op migration
# 서버 저장용 UserStockStorage migration을 로컬에서는 사용하지 않기 위해 비워둔다.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("stocks", "0002_alter_stocksymbol_options_and_more"),
    ]

    operations = []