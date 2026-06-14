from django.contrib import admin

from .models import (
    ChartDrawingState,
    ChartIndicatorState,
    ChartPiramidState,
    StockSymbol,
    UserStockStorage,
)


@admin.register(StockSymbol)
class StockSymbolAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "market", "updated_at")
    search_fields = ("code", "name", "market")
    list_filter = ("market",)
    ordering = ("market", "name")


@admin.register(UserStockStorage)
class UserStockStorageAdmin(admin.ModelAdmin):
    list_display = ("user", "selected_group_id", "updated_at")
    search_fields = ("user__username", "user__email", "selected_group_id")
    readonly_fields = ("updated_at",)


@admin.register(ChartDrawingState)
class ChartDrawingStateAdmin(admin.ModelAdmin):
    list_display = ("user", "stock_code", "updated_at")
    search_fields = ("user__username", "user__email", "stock_code")
    readonly_fields = ("updated_at",)


@admin.register(ChartIndicatorState)
class ChartIndicatorStateAdmin(admin.ModelAdmin):
    list_display = ("user", "stock_code", "updated_at")
    search_fields = ("user__username", "user__email", "stock_code")
    readonly_fields = ("updated_at",)


@admin.register(ChartPiramidState)
class ChartPiramidStateAdmin(admin.ModelAdmin):
    list_display = ("user", "stock_code", "updated_at")
    search_fields = ("user__username", "user__email", "stock_code")
    readonly_fields = ("updated_at",)