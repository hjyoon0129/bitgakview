from datetime import timedelta

from django.contrib import admin, messages
from django.db.models import Count, Sum
from django.shortcuts import redirect
from django.urls import path, reverse
from django.utils import timezone

from .models import VisitLog


AGG_HASH = "__aggregate__"
PATH_SUMMARY = "__summary__"
PATH_UNIQUE = "__unique_visitors__"
INTERNAL_PATHS = [PATH_SUMMARY, PATH_UNIQUE]


@admin.register(VisitLog)
class VisitLogAdmin(admin.ModelAdmin):
    """
    VisitLog는 관리자 메뉴에 남겨두되, raw list는 보여주지 않는다.
    middleware는 IP/User-Agent/Referer 원문 없이 집계 row만 저장한다.
    """

    change_list_template = "admin/analytics/visitlog/change_list.html"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        # 대시보드 접근은 허용, 개별 row 수정 화면은 차단
        return obj is None

    def has_delete_permission(self, request, obj=None):
        # 개별 삭제 대신 대시보드 버튼으로만 정리
        return obj is None

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "clear-today/",
                self.admin_site.admin_view(self.clear_today_stats),
                name="analytics_visitlog_clear_today",
            ),
            path(
                "clear-old/",
                self.admin_site.admin_view(self.clear_old_stats),
                name="analytics_visitlog_clear_old",
            ),
            path(
                "clear-all/",
                self.admin_site.admin_view(self.clear_all_stats),
                name="analytics_visitlog_clear_all",
            ),
        ]
        return custom_urls + urls

    def _redirect_to_dashboard(self):
        return redirect(reverse("admin:analytics_visitlog_changelist"))

    def _post_only(self, request):
        if request.method != "POST":
            messages.warning(request, "잘못된 접근입니다. 버튼을 눌러서 실행해주세요.")
            return False
        return True

    def clear_today_stats(self, request):
        if not self._post_only(request):
            return self._redirect_to_dashboard()

        today = timezone.localdate()
        deleted_count, _ = VisitLog.objects.filter(visit_date=today).delete()
        messages.success(request, f"오늘 방문 집계 {deleted_count}개를 삭제했습니다.")
        return self._redirect_to_dashboard()

    def clear_old_stats(self, request):
        if not self._post_only(request):
            return self._redirect_to_dashboard()

        cutoff = timezone.now() - timedelta(days=30)
        deleted_count, _ = VisitLog.objects.filter(created_at__lt=cutoff).delete()
        messages.success(request, f"30일 이전 방문 집계 {deleted_count}개를 삭제했습니다.")
        return self._redirect_to_dashboard()

    def clear_all_stats(self, request):
        if not self._post_only(request):
            return self._redirect_to_dashboard()

        deleted_count, _ = VisitLog.objects.all().delete()
        messages.success(request, f"전체 방문 집계 {deleted_count}개를 삭제했습니다.")
        return self._redirect_to_dashboard()

    def changelist_view(self, request, extra_context=None):
        now = timezone.now()
        today = timezone.localdate()
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)

        # 새 코드에서는 user_agent_hash='__aggregate__'만 생성된다.
        # 기존 raw row가 남아있어도 대시보드 통계에는 섞지 않는다.
        qs = VisitLog.objects.filter(user_agent_hash=AGG_HASH)
        today_qs = qs.filter(visit_date=today)
        week_qs = qs.filter(last_seen_at__gte=week_start)
        month_qs = qs.filter(last_seen_at__gte=month_start)

        summary_qs = today_qs.filter(path=PATH_SUMMARY)

        total_today = summary_qs.aggregate(total=Sum("request_count"))["total"] or 0
        human_today = summary_qs.filter(bot_status="human").aggregate(total=Sum("request_count"))["total"] or 0
        bot_today = summary_qs.filter(bot_status="bot").aggregate(total=Sum("request_count"))["total"] or 0
        suspicious_today = summary_qs.filter(bot_status__in=["suspicious", "blocked"]).aggregate(total=Sum("request_count"))["total"] or 0

        unique_today = today_qs.filter(path=PATH_UNIQUE).aggregate(total=Sum("request_count"))["total"] or 0
        unique_week = week_qs.filter(path=PATH_UNIQUE).aggregate(total=Sum("request_count"))["total"] or 0
        unique_month = month_qs.filter(path=PATH_UNIQUE).aggregate(total=Sum("request_count"))["total"] or 0

        type_rows = []
        for status, label in [
            ("human", "Human"),
            ("bot", "Bot"),
            ("suspicious", "Suspicious"),
            ("blocked", "Blocked"),
        ]:
            count = summary_qs.filter(bot_status=status).aggregate(total=Sum("request_count"))["total"] or 0
            percent = round((count / total_today) * 100, 1) if total_today else 0
            type_rows.append({"label": label, "count": count, "percent": percent})

        top_path_rows = (
            today_qs
            .exclude(path__in=INTERNAL_PATHS)
            .filter(bot_status="human")
            .values("path")
            .annotate(count=Sum("request_count"))
            .order_by("-count")[:15]
        )

        blocked_rows = (
            today_qs
            .exclude(path__in=INTERNAL_PATHS)
            .exclude(bot_status="human")
            .values("path", "bot_status", "reason")
            .annotate(count=Sum("request_count"))
            .order_by("-count")[:15]
        )

        # 기존 raw row가 남아있는지 확인용. 화면에는 목록으로 보여주지 않고 숫자만 표시.
        legacy_raw_rows = VisitLog.objects.exclude(user_agent_hash=AGG_HASH).count()
        aggregate_rows = qs.count()

        extra_context = extra_context or {}
        extra_context.update({
            "title": "Visitor Analytics",
            "total_today": total_today,
            "human_today": human_today,
            "bot_today": bot_today,
            "suspicious_today": suspicious_today,
            "unique_today": unique_today,
            "unique_week": unique_week,
            "unique_month": unique_month,
            "aggregate_rows": aggregate_rows,
            "legacy_raw_rows": legacy_raw_rows,
            "type_rows": type_rows,
            "top_path_rows": top_path_rows,
            "blocked_rows": blocked_rows,
            "clear_today_url": reverse("admin:analytics_visitlog_clear_today"),
            "clear_old_url": reverse("admin:analytics_visitlog_clear_old"),
            "clear_all_url": reverse("admin:analytics_visitlog_clear_all"),
        })

        return super().changelist_view(request, extra_context=extra_context)
