from datetime import timedelta

from django.contrib import admin, messages
from django.db.models import Sum
from django.shortcuts import redirect
from django.urls import path, reverse
from django.utils import timezone

from .models import VisitLog

try:
    from .middleware import AGG_HASH, PATH_SUMMARY, PATH_UNIQUE
except Exception:
    AGG_HASH = "__aggregate__"
    PATH_SUMMARY = "__summary__"
    PATH_UNIQUE = "__unique_visitors__"


class VisitLogAdmin(admin.ModelAdmin):
    """
    VisitLog를 raw log 목록이 아니라 집계형 방문자 대시보드로 보여주는 관리자 화면입니다.

    핵심:
    - IP/User-Agent/Referer 원문을 보여주지 않음
    - 일별 total / unique / human / bot / suspicious / blocked 추이 제공
    - Chart.js 없이 admin 템플릿의 canvas + 순수 JS로 라인차트 표시
    """

    change_list_template = "admin/visitlog/visitlog/change_list.html"
    list_per_page = 20

    # 혹시 기본 admin result_list가 노출되는 상황에서도 원문성 필드는 최소화
    list_display = (
        "visit_date",
        "path",
        "bot_status",
        "reason",
        "request_count",
        "status_code",
        "last_seen_at",
    )
    list_filter = ("visit_date", "bot_status", "reason")
    search_fields = ("path", "reason")
    ordering = ("-visit_date", "-last_seen_at")

    def has_add_permission(self, request):
        return False

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "clear-today/",
                self.admin_site.admin_view(self.clear_today),
                name="visitlog_visitlog_clear_today",
            ),
            path(
                "clear-old/",
                self.admin_site.admin_view(self.clear_old),
                name="visitlog_visitlog_clear_old",
            ),
            path(
                "clear-all/",
                self.admin_site.admin_view(self.clear_all),
                name="visitlog_visitlog_clear_all",
            ),
        ]
        return custom_urls + urls

    def changelist_view(self, request, extra_context=None):
        today = timezone.localdate()

        # 차트는 기본 최근 60일을 넘깁니다. 화면에서 7/14/30/60일로 필터링합니다.
        start_date = today - timedelta(days=59)
        dates = [start_date + timedelta(days=i) for i in range(60)]

        daily_map = {
            date.isoformat(): {
                "date": date.isoformat(),
                "total": 0,
                "unique": 0,
                "human": 0,
                "bot": 0,
                "suspicious": 0,
                "blocked": 0,
            }
            for date in dates
        }

        summary_qs = (
            VisitLog.objects
            .filter(
                user_agent_hash=AGG_HASH,
                path=PATH_SUMMARY,
                visit_date__gte=start_date,
                visit_date__lte=today,
            )
            .values("visit_date", "bot_status")
            .annotate(count=Sum("request_count"))
            .order_by("visit_date")
        )

        for row in summary_qs:
            date_key = row["visit_date"].isoformat()
            status = row.get("bot_status") or "human"
            count = int(row.get("count") or 0)
            if date_key not in daily_map:
                continue

            if status in daily_map[date_key]:
                daily_map[date_key][status] += count
            daily_map[date_key]["total"] += count

        unique_qs = (
            VisitLog.objects
            .filter(
                user_agent_hash=AGG_HASH,
                path=PATH_UNIQUE,
                visit_date__gte=start_date,
                visit_date__lte=today,
            )
            .values("visit_date")
            .annotate(count=Sum("request_count"))
            .order_by("visit_date")
        )

        for row in unique_qs:
            date_key = row["visit_date"].isoformat()
            if date_key in daily_map:
                daily_map[date_key]["unique"] = int(row.get("count") or 0)

        daily_chart_rows = [daily_map[date.isoformat()] for date in dates]

        today_key = today.isoformat()
        today_row = daily_map.get(today_key, {})

        total_today = int(today_row.get("total") or 0)
        unique_today = int(today_row.get("unique") or 0)
        human_today = int(today_row.get("human") or 0)
        bot_today = int(today_row.get("bot") or 0)
        suspicious_raw_today = int(today_row.get("suspicious") or 0)
        blocked_raw_today = int(today_row.get("blocked") or 0)
        suspicious_today = suspicious_raw_today + blocked_raw_today

        def sum_range(days, key):
            start = today - timedelta(days=days - 1)
            return sum(int(row.get(key) or 0) for row in daily_chart_rows if row["date"] >= start.isoformat())

        unique_week = sum_range(7, "unique")
        unique_month = sum_range(30, "unique")

        type_labels = [
            ("Human", "human", human_today),
            ("Bot", "bot", bot_today),
            ("Suspicious", "suspicious", suspicious_raw_today),
            ("Blocked", "blocked", blocked_raw_today),
        ]
        type_total = sum(item[2] for item in type_labels) or 1
        type_rows = [
            {
                "label": label,
                "key": key,
                "count": count,
                "percent": round((count / type_total) * 100, 1),
            }
            for label, key, count in type_labels
        ]

        aggregate_rows = (
            VisitLog.objects
            .filter(ip_address__isnull=True, user_agent_hash=AGG_HASH)
            .count()
        )

        legacy_raw_rows = (
            VisitLog.objects
            .exclude(ip_address__isnull=True, user_agent_hash=AGG_HASH)
            .count()
        )

        top_path_rows = list(
            VisitLog.objects
            .filter(
                ip_address__isnull=True,
                user_agent_hash=AGG_HASH,
                visit_date=today,
            )
            .exclude(path__in=[PATH_SUMMARY, PATH_UNIQUE])
            .values("path")
            .annotate(count=Sum("request_count"))
            .order_by("-count", "path")[:20]
        )

        blocked_rows = list(
            VisitLog.objects
            .filter(
                ip_address__isnull=True,
                user_agent_hash=AGG_HASH,
                visit_date=today,
                bot_status__in=["bot", "suspicious", "blocked"],
            )
            .exclude(path__in=[PATH_SUMMARY, PATH_UNIQUE])
            .values("path", "bot_status", "reason")
            .annotate(count=Sum("request_count"))
            .order_by("-count", "path")[:30]
        )

        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": "Visitor Analytics",
            "total_today": total_today,
            "unique_today": unique_today,
            "human_today": human_today,
            "bot_today": bot_today,
            "suspicious_today": suspicious_today,
            "suspicious_raw_today": suspicious_raw_today,
            "blocked_today": blocked_raw_today,
            "unique_week": unique_week,
            "unique_month": unique_month,
            "aggregate_rows": aggregate_rows,
            "legacy_raw_rows": legacy_raw_rows,
            "type_rows": type_rows,
            "top_path_rows": top_path_rows,
            "blocked_rows": blocked_rows,
            "daily_chart_rows": daily_chart_rows,
            "clear_today_url": reverse("admin:visitlog_visitlog_clear_today"),
            "clear_old_url": reverse("admin:visitlog_visitlog_clear_old"),
            "clear_all_url": reverse("admin:visitlog_visitlog_clear_all"),
        }

        if extra_context:
            context.update(extra_context)

        return super().changelist_view(request, extra_context=context)

    def clear_today(self, request):
        if request.method == "POST":
            today = timezone.localdate()
            deleted, _ = VisitLog.objects.filter(visit_date=today).delete()
            self.message_user(request, f"오늘 방문 집계 {deleted}개를 삭제했습니다.", messages.SUCCESS)
        return redirect(self._changelist_url())

    def clear_old(self, request):
        if request.method == "POST":
            cutoff = timezone.localdate() - timedelta(days=30)
            deleted, _ = VisitLog.objects.filter(visit_date__lt=cutoff).delete()
            self.message_user(request, f"30일 이전 방문 집계 {deleted}개를 삭제했습니다.", messages.SUCCESS)
        return redirect(self._changelist_url())

    def clear_all(self, request):
        if request.method == "POST":
            deleted, _ = VisitLog.objects.all().delete()
            self.message_user(request, f"방문 집계와 기존 raw row {deleted}개를 모두 삭제했습니다.", messages.SUCCESS)
        return redirect(self._changelist_url())

    def _changelist_url(self):
        meta = self.model._meta
        return reverse(f"admin:{meta.app_label}_{meta.model_name}_changelist")


admin.site.register(VisitLog, VisitLogAdmin)
