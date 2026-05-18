from datetime import timedelta
from django.contrib import admin, messages
from django.db.models import Count, Sum
from django.utils import timezone
from .models import VisitLog


@admin.action(description="Delete logs older than 30 days")
def delete_older_than_30_days(modeladmin, request, queryset):
    cutoff = timezone.now() - timedelta(days=30)
    deleted_count, _ = VisitLog.objects.filter(created_at__lt=cutoff).delete()
    messages.success(request, f"Deleted {deleted_count} old visit logs.")


@admin.register(VisitLog)
class VisitLogAdmin(admin.ModelAdmin):
    change_list_template = "admin/analytics/visitlog/change_list.html"

    list_display = (
        "last_seen_at",
        "ip_address",
        "clean_path",
        "method",
        "status_code",
        "bot_status",
        "request_count",
        "reason",
        "short_user_agent",
    )
    list_filter = ("bot_status", "method", "status_code", "visit_date")
    search_fields = ("ip_address", "path", "user_agent", "referer", "reason")
    readonly_fields = (
        "ip_address", "path", "method", "user_agent", "user_agent_hash", "referer",
        "status_code", "bot_status", "reason", "request_count", "visit_date",
        "first_seen_at", "last_seen_at", "created_at",
    )
    date_hierarchy = "visit_date"
    ordering = ("-last_seen_at",)
    list_per_page = 30
    actions = [delete_older_than_30_days]

    def clean_path(self, obj):
        return obj.path[:90]
    clean_path.short_description = "Path"

    def short_user_agent(self, obj):
        if not obj.user_agent:
            return "-"
        return obj.user_agent[:90]
    short_user_agent.short_description = "User Agent"

    def changelist_view(self, request, extra_context=None):
        now = timezone.now()
        today = timezone.localdate()
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)

        qs = VisitLog.objects.all()
        today_qs = qs.filter(visit_date=today)
        week_qs = qs.filter(last_seen_at__gte=week_start)
        month_qs = qs.filter(last_seen_at__gte=month_start)

        total_today = today_qs.aggregate(total=Sum("request_count"))["total"] or 0
        human_today = today_qs.filter(bot_status="human").aggregate(total=Sum("request_count"))["total"] or 0
        bot_today = today_qs.filter(bot_status="bot").aggregate(total=Sum("request_count"))["total"] or 0
        suspicious_today = today_qs.filter(bot_status__in=["suspicious", "blocked"]).aggregate(total=Sum("request_count"))["total"] or 0

        unique_today = today_qs.values("ip_address").distinct().count()
        unique_week = week_qs.values("ip_address").distinct().count()
        unique_month = month_qs.values("ip_address").distinct().count()

        type_rows = []
        for status, label in [
            ("human", "Human"),
            ("bot", "Bot"),
            ("suspicious", "Suspicious"),
            ("blocked", "Blocked"),
        ]:
            count = today_qs.filter(bot_status=status).aggregate(total=Sum("request_count"))["total"] or 0
            percent = round((count / total_today) * 100, 1) if total_today else 0
            type_rows.append({"label": label, "count": count, "percent": percent})

        top_path_rows = (
            today_qs.values("path")
            .annotate(count=Sum("request_count"), unique_ips=Count("ip_address", distinct=True))
            .order_by("-count")[:12]
        )

        top_ip_rows = (
            today_qs.values("ip_address", "bot_status")
            .annotate(count=Sum("request_count"), paths=Count("path", distinct=True))
            .order_by("-count")[:12]
        )

        suspicious_rows = (
            today_qs.exclude(bot_status="human")
            .values("ip_address", "path", "bot_status", "reason")
            .annotate(count=Sum("request_count"))
            .order_by("-count")[:12]
        )

        recent_human_rows = (
            today_qs.filter(bot_status="human")
            .values("ip_address", "path", "last_seen_at", "request_count", "user_agent")
            .order_by("-last_seen_at")[:12]
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
            "recent_human_rows": recent_human_rows,
        })

        return super().changelist_view(request, extra_context=extra_context)
