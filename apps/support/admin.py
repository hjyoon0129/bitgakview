from django.contrib import admin
from .models import SupportInquiry


@admin.register(SupportInquiry)
class SupportInquiryAdmin(admin.ModelAdmin):
    list_display = ("subject", "category", "email", "status", "user", "created_at")
    list_filter = ("category", "status", "created_at")
    search_fields = ("subject", "message", "email", "name", "page_url")
    readonly_fields = ("user", "name", "email", "category", "subject", "message", "page_url", "created_at", "updated_at")
    list_editable = ("status",)
    date_hierarchy = "created_at"
    fieldsets = (
        ("문의 정보", {"fields": ("status", "category", "subject", "message", "page_url")}),
        ("작성자", {"fields": ("user", "name", "email")}),
        ("관리", {"fields": ("admin_note", "created_at", "updated_at")}),
    )
