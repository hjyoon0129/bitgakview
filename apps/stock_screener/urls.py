from django.urls import path
from . import views

app_name = "stock_screener"

urlpatterns = [
    path("", views.screener_page, name="page"),
    path("api/", views.screener_api, name="api"),
    path("api/search/", views.screener_api, name="api_search"),
    path("api/symbols/", views.symbol_search_api, name="symbol_search"),
    path("api/backtest/", views.backtest_api, name="backtest"),
    path("api/backtest-stock/", views.single_stock_backtest_api, name="single_stock_backtest"),
    path("api/strategies/", views.strategy_list_api, name="strategy_list"),
    path("api/strategies/save/", views.strategy_save_api, name="strategy_save"),
    path("api/strategies/delete/", views.strategy_delete_api, name="strategy_delete"),
]
