import json

from .models import UNLIMITED, UserAccess


FREE_INDICATOR_LIMIT = 2
FREE_WATCHLIST_LIMIT = 10
FREE_GROUP_LIMIT = 1
FREE_DRAWING_LIMIT = 10


def get_or_create_access(user):
    if not user or not user.is_authenticated:
        return None

    access, _ = UserAccess.objects.get_or_create(
        user=user,
        defaults={
            "plan": UserAccess.PLAN_FREE,
            "indicator_limit": FREE_INDICATOR_LIMIT,
            "watchlist_limit": FREE_WATCHLIST_LIMIT,
            "group_limit": FREE_GROUP_LIMIT,
            "drawing_limit": FREE_DRAWING_LIMIT,
        },
    )

    # 프리미엄 만료 시 무료 제한값으로 자연 복귀
    if access.plan == UserAccess.PLAN_PREMIUM and not access.is_premium:
        access.apply_free_limits(save=True)

    return access


def get_access_payload(user):
    if not user or not user.is_authenticated:
        return {
            "is_authenticated": False,
            "is_premium": False,
            "plan": "guest",
            "premium_until": "",
            "indicator_limit": 0,
            "watchlist_limit": 0,
            "group_limit": 0,
            "drawing_limit": 0,
            "unlimited_value": UNLIMITED,
            "features": {
                "chart_search": True,
                "chart_view": True,
                "drawing": True,
                "indicator_apply": False,
                "watchlist": False,
                "group_manage": False,
                "avg_calculator": False,
                "portfolio": False,
            },
        }

    access = get_or_create_access(user)
    is_premium = access.is_premium

    if is_premium:
        indicator_limit = UNLIMITED
        watchlist_limit = UNLIMITED
        group_limit = UNLIMITED
        drawing_limit = UNLIMITED
    else:
        indicator_limit = access.indicator_limit or FREE_INDICATOR_LIMIT
        watchlist_limit = access.watchlist_limit or FREE_WATCHLIST_LIMIT
        group_limit = access.group_limit or FREE_GROUP_LIMIT
        drawing_limit = access.drawing_limit or FREE_DRAWING_LIMIT

    return {
        "is_authenticated": True,
        "is_premium": is_premium,
        "plan": "premium" if is_premium else "free",
        "premium_until": access.premium_until.isoformat() if access.premium_until else "",
        "indicator_limit": indicator_limit,
        "watchlist_limit": watchlist_limit,
        "group_limit": group_limit,
        "drawing_limit": drawing_limit,
        "unlimited_value": UNLIMITED,
        "features": {
            "chart_search": True,
            "chart_view": True,
            "drawing": True,
            "indicator_apply": True,
            "watchlist": True,
            "group_manage": True,
            "avg_calculator": is_premium,
            "portfolio": is_premium,
        },
    }


def get_access_json(user):
    return json.dumps(get_access_payload(user), ensure_ascii=False)


def is_premium_user(user):
    access = get_or_create_access(user)
    return bool(access and access.is_premium)


def require_login_feature(user):
    return bool(user and user.is_authenticated)


def require_premium_feature(user):
    return is_premium_user(user)
