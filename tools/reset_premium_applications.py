"""
로컬 테스트용 프리미엄 신청/권한 초기화 스크립트.

사용법:
python tools/reset_premium_applications.py pycel0129
python tools/reset_premium_applications.py --all-applications
"""
import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.apps import apps
from django.contrib.auth import get_user_model

User = get_user_model()


def reset_user(username):
    users = User.objects.filter(username=username)
    print("users:", users.count())

    for app_label, model_name in [("access", "PremiumApplication"), ("stocks", "PremiumApplication")]:
        try:
            M = apps.get_model(app_label, model_name)
        except LookupError:
            print(app_label, model_name, "없음")
            continue
        count = M.objects.filter(user__in=users).count()
        M.objects.filter(user__in=users).delete()
        print(app_label, model_name, "deleted:", count)

    UA = apps.get_model("access", "UserAccess")
    UA.objects.filter(user__in=users).update(
        plan="free",
        premium_until=None,
        indicator_limit=2,
        watchlist_limit=10,
        group_limit=1,
        drawing_limit=10,
    )
    print("UserAccess reset free")


def clear_all_applications():
    for app_label, model_name in [("access", "PremiumApplication"), ("stocks", "PremiumApplication")]:
        try:
            M = apps.get_model(app_label, model_name)
        except LookupError:
            print(app_label, model_name, "없음")
            continue
        count = M.objects.count()
        M.objects.all().delete()
        print(app_label, model_name, "deleted:", count)


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--all-applications":
        clear_all_applications()
    elif len(sys.argv) >= 2:
        reset_user(sys.argv[1])
    else:
        print("사용법: python tools/reset_premium_applications.py <username>")
        print("또는: python tools/reset_premium_applications.py --all-applications")
