import json
import re
from uuid import uuid4

from django.db import models
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify


def insight_cover_upload_to(instance, filename):
    return f"insights/{timezone.now():%Y/%m}/{filename}"


class InsightPost(models.Model):
    class ContentType(models.TextChoices):
        YOUTUBE = "youtube", "유튜브 관점"
        NOTE = "note", "일반 관점"
        MARKET = "market", "시장 관점"

    class MediaType(models.TextChoices):
        IMAGE = "image", "이미지 방식"
        CHART = "chart", "차트 방식"

    content_type = models.CharField(
        max_length=20,
        choices=ContentType.choices,
        default=ContentType.NOTE,
        verbose_name="콘텐츠 유형",
    )
    media_type = models.CharField(
        max_length=20,
        choices=MediaType.choices,
        default=MediaType.IMAGE,
        verbose_name="표시 방식",
    )
    title = models.CharField(max_length=140, verbose_name="제목")
    slug = models.SlugField(
        max_length=180,
        unique=True,
        blank=True,
        allow_unicode=True,
        verbose_name="주소 슬러그",
    )

    # 기존 코드와 호환용 필드
    eyebrow = models.CharField(max_length=60, blank=True, verbose_name="상단 라벨")
    summary = models.CharField(max_length=240, blank=True, verbose_name="짧은 설명")
    related_symbol = models.CharField(max_length=20, blank=True, verbose_name="관련 종목코드")
    related_name = models.CharField(max_length=80, blank=True, verbose_name="관련 종목명")
    tags = models.CharField(max_length=220, blank=True, verbose_name="태그")
    thumbnail_url = models.URLField(blank=True, verbose_name="커스텀 썸네일 URL")

    content = models.TextField(verbose_name="본문")
    cover_image = models.ImageField(
        upload_to=insight_cover_upload_to,
        blank=True,
        null=True,
        verbose_name="대표 이미지",
    )
    youtube_url = models.URLField(blank=True, verbose_name="유튜브 URL")

    # 차트 방식 저장 필드
    chart_code = models.CharField(max_length=20, blank=True, verbose_name="차트 종목코드")
    chart_name = models.CharField(max_length=80, blank=True, verbose_name="차트 종목명")
    chart_interval = models.CharField(max_length=20, blank=True, default="1d", verbose_name="차트 시간봉")
    chart_api_url = models.CharField(max_length=240, blank=True, verbose_name="차트 API URL")
    chart_snapshot = models.TextField(blank=True, verbose_name="차트 저장 스냅샷")

    risk_notice = models.CharField(
        max_length=240,
        default="본 콘텐츠는 학습 및 관점 공유용이며, 특정 종목의 매수·매도 추천이 아닙니다.",
        verbose_name="고지 문구",
    )

    is_featured = models.BooleanField(default=True, verbose_name="캐러셀 노출")
    is_published = models.BooleanField(default=True, verbose_name="공개 여부")
    display_order = models.PositiveIntegerField(default=0, verbose_name="노출 순서")
    published_at = models.DateTimeField(blank=True, null=True, verbose_name="공개일")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="생성일")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="수정일")

    class Meta:
        verbose_name = "빗각관점"
        verbose_name_plural = "빗각관점"
        ordering = ["display_order", "-published_at", "-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.media_type == self.MediaType.CHART:
            if self.chart_code and not self.related_symbol:
                self.related_symbol = self.chart_code
            if self.chart_name and not self.related_name:
                self.related_name = self.chart_name

        if not self.slug:
            base_slug = slugify(self.title, allow_unicode=True).strip("-_")
            if not base_slug:
                base_slug = f"view-{uuid4().hex[:8]}"

            slug = base_slug
            number = 2
            while InsightPost.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base_slug}-{number}"
                number += 1
            self.slug = slug

        if self.is_published and not self.published_at:
            self.published_at = timezone.now()

        super().save(*args, **kwargs)

    @property
    def published_date(self):
        return self.published_at or self.created_at

    @property
    def has_youtube(self):
        return bool(self.youtube_url)

    @property
    def youtube_id(self):
        if not self.youtube_url:
            return ""

        patterns = [
            r"youtu\.be/([^?&/]+)",
            r"youtube\.com/watch\?v=([^?&]+)",
            r"youtube\.com/shorts/([^?&/]+)",
            r"youtube\.com/embed/([^?&/]+)",
        ]

        for pattern in patterns:
            match = re.search(pattern, self.youtube_url)
            if match:
                return match.group(1)

        return ""

    @property
    def youtube_thumbnail_url(self):
        if self.thumbnail_url:
            return self.thumbnail_url

        if self.youtube_id:
            return f"https://img.youtube.com/vi/{self.youtube_id}/hqdefault.jpg"

        return ""

    @property
    def chart_thumbnail_data_url(self):
        if not self.chart_snapshot:
            return ""
        try:
            payload = json.loads(self.chart_snapshot)
        except Exception:
            return ""
        value = str(payload.get("thumbnailDataUrl") or payload.get("thumbnail") or "")
        if value.startswith("data:image/"):
            return value
        return ""

    @property
    def image_url(self):
        if self.cover_image:
            try:
                return self.cover_image.url
            except Exception:
                return ""

        if self.thumbnail_url:
            return self.thumbnail_url

        if self.media_type == self.MediaType.CHART:
            chart_thumb = self.chart_thumbnail_data_url
            if chart_thumb:
                return chart_thumb

        return self.youtube_thumbnail_url

    @property
    def excerpt(self):
        source = (self.summary or self.content or "").replace("\\r", " ").replace("\\n", " ").strip()
        if len(source) <= 74:
            return source
        return source[:74] + "..."

    def get_absolute_url(self):
        return reverse("insights:detail", kwargs={"slug": self.slug})
