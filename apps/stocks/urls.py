from django.urls import path

from . import views


app_name = "stocks"


urlpatterns = [
    path("", views.stock_search, name="search"),

    path("features/", views.features_view, name="features"),
    path("pricing/", views.pricing_view, name="pricing"),

    path("api/ohlcv/<str:code>/", views.api_ohlcv, name="api_ohlcv"),
    path("api/chart/", views.api_chart, name="api_chart"),
    path("api/market-temperature/", views.api_market_temperature, name="api_market_temperature"),

    path("<str:code>/", views.stock_detail, name="detail"),
]