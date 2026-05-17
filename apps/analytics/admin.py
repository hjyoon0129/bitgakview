from django.contrib import admin
from django.utils import timezone
from datetime import timedelta
from .models import VisitLog


@admin.register(VisitLog)
class VisitLogAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "ip_address",
        "path",
        "method",
        "status_code",
        "bot_status",
        "reason",
        "short_user_agent",
    )
    list_filter = ("bot_status", "method", "status_code", "created_at")
    search_fields = ("ip_address", "path", "user_agent", "referer", "reason")
    readonly_fields = (
        "ip_address",
        "path",
        "method",
        "user_agent",
        "referer",
        "status_code",
        "bot_status",
        "reason",
        "created_at",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    def short_user_agent(self, obj):
        if not obj.user_agent:
            return "-"
        return obj.user_agent[:80]
    short_user_agent.short_description = "User Agent"

    def changelist_view(self, request, extra_context=None):
        today = timezone.localdate()
        today_start = timezone.make_aware(
            timezone.datetime.combine(today, timezone.datetime.min.time())
        )

        qs_today = VisitLog.objects.filter(created_at__gte=today_start)

        extra_context = extra_context or {}
        extra_context["today_total_views"] = qs_today.count()
        extra_context["today_unique_ips"] = qs_today.values("ip_address").distinct().count()
        extra_context["today_human"] = qs_today.filter(bot_status="human").count()
        extra_context["today_bot"] = qs_today.filter(bot_status="bot").count()
        extra_context["today_suspicious"] = qs_today.filter(bot_status="suspicious").count()

        return super().changelist_view(request, extra_context=extra_context)