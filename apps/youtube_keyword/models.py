from django.conf import settings
from django.db import models
from django.utils import timezone


class YoutubeKeywordSearch(models.Model):
    SEARCH_TYPE_SHORTS = "shorts"
    SEARCH_TYPE_LONGFORM = "longform"

    SEARCH_TYPE_CHOICES = [
        (SEARCH_TYPE_SHORTS, "쇼츠용 키워드"),
        (SEARCH_TYPE_LONGFORM, "일반 유튜브 키워드"),
    ]

    CATEGORY_CHOICES = [
        ("all", "전체"),
        ("stock", "주식"),
        ("economy", "경제"),
        ("life", "생활"),
        ("living", "리빙"),
        ("parenting", "육아"),
        ("travel", "여행"),
        ("it", "IT"),
        ("game", "게임"),
        ("sidejob", "부업"),
        ("car", "자동차"),
        ("etc", "기타"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="youtube_keyword_searches",
        verbose_name="사용자",
    )
    keyword = models.CharField(max_length=120, verbose_name="검색어")
    search_type = models.CharField(
        max_length=20,
        choices=SEARCH_TYPE_CHOICES,
        default=SEARCH_TYPE_SHORTS,
        verbose_name="분석 유형",
    )
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default="all",
        verbose_name="카테고리",
    )
    result_json = models.JSONField(default=dict, blank=True, verbose_name="분석 결과")
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="IP")
    user_agent = models.TextField(blank=True, default="", verbose_name="User Agent")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="생성일")

    class Meta:
        verbose_name = "유튜브 키워드 검색 기록"
        verbose_name_plural = "유튜브 키워드 검색 기록"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.keyword} / {self.get_search_type_display()}"


class YoutubeKeywordDailyUsage(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="youtube_keyword_daily_usages",
        verbose_name="사용자",
    )
    date = models.DateField(default=timezone.localdate, db_index=True, verbose_name="사용일")
    search_count = models.PositiveIntegerField(default=0, verbose_name="검색 횟수")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="수정일")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="생성일")

    class Meta:
        verbose_name = "유튜브 키워드 일일 사용량"
        verbose_name_plural = "유튜브 키워드 일일 사용량"
        unique_together = ("user", "date")
        ordering = ["-date", "-updated_at"]

    def __str__(self):
        username = getattr(self.user, "username", str(self.user_id))
        return f"{username} / {self.date} / {self.search_count}회"


class YoutubeKeywordPremiumGrant(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="youtube_keyword_premium_grants",
        verbose_name="사용자",
    )
    is_active = models.BooleanField(default=True, verbose_name="활성화")
    starts_at = models.DateField(null=True, blank=True, verbose_name="시작일")
    expires_at = models.DateField(null=True, blank=True, verbose_name="만료일")
    memo = models.CharField(max_length=255, blank=True, default="", verbose_name="관리자 메모")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="youtube_keyword_grants_created",
        verbose_name="승인 관리자",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="생성일")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="수정일")

    class Meta:
        verbose_name = "유튜브 키워드 프리미엄 승인"
        verbose_name_plural = "유튜브 키워드 프리미엄 승인"
        ordering = ["-created_at"]

    def is_valid_today(self):
        today = timezone.localdate()
        if not self.is_active:
            return False
        if self.starts_at and self.starts_at > today:
            return False
        if self.expires_at and self.expires_at < today:
            return False
        return True

    @property
    def status_label(self):
        return "사용 가능" if self.is_valid_today() else "비활성/만료"

    def __str__(self):
        username = getattr(self.user, "username", str(self.user_id))
        return f"{username} / {self.status_label}"
