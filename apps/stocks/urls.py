from django.urls import path

from . import views

app_name = "stocks"

urlpatterns = [
    path("", views.stock_search, name="search"),

    path("api/market-temperature/", views.api_market_temperature, name="api_market_temperature"),
    path("api/ohlcv/<str:code>/", views.api_ohlcv, name="api_ohlcv"),

    path("<str:code>/", views.stock_detail, name="detail"),
]