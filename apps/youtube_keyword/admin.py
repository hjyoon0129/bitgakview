from django.contrib import admin

from .models import YoutubeKeywordDailyUsage, YoutubeKeywordPremiumGrant, YoutubeKeywordSearch


@admin.register(YoutubeKeywordSearch)
class YoutubeKeywordSearchAdmin(admin.ModelAdmin):
    list_display = (
        "keyword",
        "search_type",
        "category",
        "user",
        "ip_address",
        "created_at",
    )
    list_filter = ("search_type", "category", "created_at")
    search_fields = ("keyword", "user__username", "user__email", "ip_address")
    readonly_fields = ("created_at",)


@admin.register(YoutubeKeywordDailyUsage)
class YoutubeKeywordDailyUsageAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "search_count", "updated_at")
    list_filter = ("date", "updated_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "date"


@admin.register(YoutubeKeywordPremiumGrant)
class YoutubeKeywordPremiumGrantAdmin(admin.ModelAdmin):
    list_display = ("user", "is_active", "status_label", "starts_at", "expires_at", "created_by", "created_at")
    list_filter = ("is_active", "starts_at", "expires_at", "created_at")
    search_fields = ("user__username", "user__email", "memo")
    readonly_fields = ("created_at", "updated_at", "status_label")
    autocomplete_fields = ("user", "created_by")

    def save_model(self, request, obj, form, change):
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
