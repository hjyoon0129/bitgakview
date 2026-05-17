from django.conf import settings
from django.db import models


class SupportInquiry(models.Model):
    CATEGORY_CHOICES = [
        ("general", "일반 문의"),
        ("account", "계정/로그인"),
        ("payment", "결제/환불"),
        ("data", "시세/데이터"),
        ("bug", "오류 제보"),
        ("report", "권리 침해 신고"),
        ("partnership", "제휴 문의"),
    ]
    STATUS_CHOICES = [
        ("new", "신규"),
        ("reviewing", "확인 중"),
        ("done", "처리 완료"),
        ("spam", "스팸/보류"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_inquiries",
        verbose_name="회원",
    )
    name = models.CharField("이름/닉네임", max_length=80, blank=True)
    email = models.EmailField("회신 이메일")
    category = models.CharField("문의 유형", max_length=32, choices=CATEGORY_CHOICES, default="general")
    subject = models.CharField("제목", max_length=160)
    message = models.TextField("문의 내용")
    page_url = models.URLField("문제 발생 페이지", blank=True)
    status = models.CharField("처리 상태", max_length=20, choices=STATUS_CHOICES, default="new")
    admin_note = models.TextField("관리자 메모", blank=True)
    created_at = models.DateTimeField("접수일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "고객 문의"
        verbose_name_plural = "고객 문의"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.get_category_display()}] {self.subject}"
