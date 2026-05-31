from django.urls import path

from . import views

app_name = "insights"

urlpatterns = [
    # API는 상세 slug 라우트보다 반드시 위에 있어야 합니다.
    path("api/stock-search/", views.stock_search_api, name="stock_search_api"),
    path("api/chart-draft/", views.chart_draft_api, name="chart_draft_api"),
    path("api/chart-draft/<str:slug>/", views.chart_draft_api, name="chart_draft_post_api"),

    path("", views.insight_list, name="list"),
    path("write/", views.insight_create, name="create"),

    # 한글/자모/특수 유니코드 슬러그도 열리도록 <slug:slug> 대신 <str:slug> 사용
    path("<str:slug>/edit/", views.insight_update, name="update"),
    path("<str:slug>/delete/", views.insight_delete, name="delete"),
    path("<str:slug>/", views.insight_detail, name="detail"),
]
