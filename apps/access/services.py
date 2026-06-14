from django.utils import timezone

from .models import UserAccess, PremiumApplication


def get_user_access(user):
    if not getattr(user, "is_authenticated", False):
        return None
    access, _ = UserAccess.objects.get_or_create(user=user)
    return access


def get_latest_premium_application(user):
    if not getattr(user, "is_authenticated", False):
        return None
    return PremiumApplication.objects.filter(user=user).order_by("-created_at").first()


def get_access_payload(user):
    if not getattr(user, "is_authenticated", False):
        return {
            "is_authenticated": False,
            "plan": "anonymous",
            "is_premium": False,
            "premium_until": None,
            "indicator_limit": 0,
            "watchlist_limit": 0,
            "group_limit": 0,
            "drawing_limit": 0,
            "premium_application": None,
        }

    access = get_user_access(user)
    application = get_latest_premium_application(user)

    app_payload = None
    if application:
        app_payload = {
            "id": application.id,
            "plan": application.plan,
            "plan_label": application.get_plan_display(),
            "status": application.status,
            "status_label": application.get_status_display(),
            "source": application.source,
            "user_message": application.user_message,
            "admin_reply": application.admin_reply or application.default_reply(),
            "created_at": application.created_at.isoformat() if application.created_at else None,
            "approved_at": application.approved_at.isoformat() if application.approved_at else None,
            "notice_seen": bool(application.notice_seen_at),
            "show_modal": application.is_notice_unread,
        }

    return {
        "is_authenticated": True,
        "plan": access.plan,
        "is_premium": access.is_premium,
        "premium_until": access.premium_until.isoformat() if access.premium_until else None,
        "indicator_limit": access.indicator_limit,
        "watchlist_limit": access.watchlist_limit,
        "group_limit": access.group_limit,
        "drawing_limit": access.drawing_limit,
        "premium_application": app_payload,
    }


def premium_stats():
    approved = PremiumApplication.objects.filter(status=PremiumApplication.STATUS_APPROVED).count()
    pending = PremiumApplication.objects.filter(status=PremiumApplication.STATUS_PENDING).count()
    return {
        "approved": approved,
        "pending": pending,
        "limit": 100,
        "remaining": max(0, 100 - approved),
        "now": timezone.now(),
    }
