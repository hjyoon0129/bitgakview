# Generated for BitgakView support app
import django.conf
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(django.conf.settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="SupportInquiry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(blank=True, max_length=80, verbose_name="이름/닉네임")),
                ("email", models.EmailField(max_length=254, verbose_name="회신 이메일")),
                ("category", models.CharField(choices=[("general", "일반 문의"), ("account", "계정/로그인"), ("payment", "결제/환불"), ("data", "시세/데이터"), ("bug", "오류 제보"), ("report", "권리 침해 신고"), ("partnership", "제휴 문의")], default="general", max_length=32, verbose_name="문의 유형")),
                ("subject", models.CharField(max_length=160, verbose_name="제목")),
                ("message", models.TextField(verbose_name="문의 내용")),
                ("page_url", models.URLField(blank=True, verbose_name="문제 발생 페이지")),
                ("status", models.CharField(choices=[("new", "신규"), ("reviewing", "확인 중"), ("done", "처리 완료"), ("spam", "스팸/보류")], default="new", max_length=20, verbose_name="처리 상태")),
                ("admin_note", models.TextField(blank=True, verbose_name="관리자 메모")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="접수일")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="수정일")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="support_inquiries", to=django.conf.settings.AUTH_USER_MODEL, verbose_name="회원")),
            ],
            options={"verbose_name": "고객 문의", "verbose_name_plural": "고객 문의", "ordering": ["-created_at"]},
        ),
    ]
