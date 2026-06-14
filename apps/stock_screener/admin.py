from django.contrib import admin

from .models import ScreenerUsage


@admin.register(ScreenerUsage)
class ScreenerUsageAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "count", "updated_at")
    search_fields = ("user__username", "user__email")
    list_filter = ("date", "updated_at")
    readonly_fields = ("updated_at",)
