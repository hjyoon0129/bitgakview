"""
VisitLog 관리자 화면 비활성화.

- Django admin에서 Visit Log 목록을 표시하지 않습니다.
- 기존 DB 테이블/모델은 그대로 두어서 마이그레이션 충돌을 피합니다.
- 기존 로그 삭제는 `python manage.py clear_visit_logs` 명령으로 처리합니다.
"""

from django.contrib import admin
from django.contrib.admin.sites import NotRegistered

from .models import VisitLog


# VisitLog는 더 이상 관리자 화면에 노출하지 않음
try:
    admin.site.unregister(VisitLog)
except NotRegistered:
    pass
