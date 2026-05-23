from django.contrib import admin
from django.utils.html import format_html

from .models import InsightPost


@admin.register(InsightPost)
class InsightPostAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "is_published",
        "is_featured",
        "display_order",
        "published_at",
        "updated_at",
    )
    list_filter = ("is_published", "is_featured", "published_at")
    search_fields = ("title", "content", "summary", "related_name", "related_symbol", "tags")
    prepopulated_fields = {}
    ordering = ("display_order", "-published_at", "-created_at")
    readonly_fields = ("created_at", "updated_at", "image_preview")

    fieldsets = (
        ("본문", {"fields": ("title", "slug", "content", "cover_image", "image_preview", "youtube_url")}),
        ("고지/노출", {"fields": ("risk_notice", "is_published", "is_featured", "display_order", "published_at")}),
        ("호환 정보", {"fields": ("content_type", "eyebrow", "summary", "related_symbol", "related_name", "tags", "thumbnail_url")}),
        ("시간", {"fields": ("created_at", "updated_at")}),
    )

    def image_preview(self, obj):
        if not obj or not obj.image_url:
            return "-"
        return format_html(
            '<img src="{}" style="max-width:260px; max-height:150px; border-radius:12px; border:1px solid #334155;" />',
            obj.image_url,
        )

    image_preview.short_description = "이미지 미리보기"
