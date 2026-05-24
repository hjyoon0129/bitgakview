from django.urls import path

from . import views


app_name = "stocks"


urlpatterns = [
    path("", views.stock_search, name="search"),

    path("features/", views.features_view, name="features"),
    path("pricing/", views.pricing_view, name="pricing"),

    path("api/search/", views.api_stock_search, name="api_stock_search"),
    path("api/ohlcv/<str:code>/", views.api_ohlcv, name="api_ohlcv"),
    path("api/chart/", views.api_chart, name="api_chart"),
    path("api/chart-data/", views.api_chart, name="api_chart_data"),
    path("api/market-temperature/", views.api_market_temperature, name="api_market_temperature"),
    path("api/user-groups/", views.user_groups_api, name="user_groups_api"),
    path("api/portfolio/", views.portfolio_api, name="portfolio_api"),
    path("api/drawings/<str:code>/", views.chart_drawings_api, name="chart_drawings_api"),
    path("api/drawing-tool-settings/", views.drawing_tool_settings_api, name="drawing_tool_settings_api"),

    # features/pricing/api 경로보다 아래에 있어야 한다.
    path("<str:code>/", views.stock_detail, name="detail"),
]
