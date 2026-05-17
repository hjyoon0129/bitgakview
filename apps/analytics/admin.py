from datetime import timedelta
from django.contrib import admin
from django.db.models import Count
from django.utils import timezone
from .models import VisitLog


@admin.register(VisitLog)
class VisitLogAdmin(admin.ModelAdmin):
    change_list_template = "admin/analytics/visitlog/change_list.html"

    list_display = (
        "created_at",
        "ip_address",
        "clean_path",
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
    list_per_page = 50

    def clean_path(self, obj):
        return obj.path[:80]
    clean_path.short_description = "Path"

    def short_user_agent(self, obj):
        if not obj.user_agent:
            return "-"
        return obj.user_agent[:90]
    short_user_agent.short_description = "User Agent"

    def changelist_view(self, request, extra_context=None):
        now = timezone.now()
        today = timezone.localdate()
        today_start = timezone.make_aware(
            timezone.datetime.combine(today, timezone.datetime.min.time())
        )
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)

        qs = VisitLog.objects.all()
        today_qs = qs.filter(created_at__gte=today_start)
        week_qs = qs.filter(created_at__gte=week_start)
        month_qs = qs.filter(created_at__gte=month_start)

        total_today = today_qs.count()
        human_today = today_qs.filter(bot_status="human").count()
        bot_today = today_qs.filter(bot_status="bot").count()
        suspicious_today = today_qs.filter(bot_status="suspicious").count()

        unique_today = today_qs.values("ip_address").distinct().count()
        unique_week = week_qs.values("ip_address").distinct().count()
        unique_month = month_qs.values("ip_address").distinct().count()

        type_rows = []
        for status, label in [
            ("human", "Human"),
            ("bot", "Bot"),
            ("suspicious", "Suspicious"),
        ]:
            count = today_qs.filter(bot_status=status).count()
            percent = round((count / total_today) * 100, 1) if total_today else 0
            type_rows.append({
                "label": label,
                "count": count,
                "percent": percent,
            })

        top_path_rows = (
            today_qs.values("path")
            .annotate(count=Count("id"))
            .order_by("-count")[:12]
        )

        top_ip_rows = (
            today_qs.values("ip_address", "bot_status")
            .annotate(count=Count("id"))
            .order_by("-count")[:12]
        )

        suspicious_rows = (
            today_qs.exclude(bot_status="human")
            .values("ip_address", "path", "bot_status", "reason")
            .annotate(count=Count("id"))
            .order_by("-count")[:12]
        )

        extra_context = extra_context or {}
        extra_context.update({
            "total_today": total_today,
            "human_today": human_today,
            "bot_today": bot_today,
            "suspicious_today": suspicious_today,
            "unique_today": unique_today,
            "unique_week": unique_week,
            "unique_month": unique_month,
            "total_all": qs.count(),
            "type_rows": type_rows,
            "top_path_rows": top_path_rows,
            "top_ip_rows": top_ip_rows,
            "suspicious_rows": suspicious_rows,
        })

        return super().changelist_view(request, extra_context=extra_context)