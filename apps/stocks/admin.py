from django.contrib import admin
from .models import ChartDrawingState, StockSymbol, UserStockStorage


@admin.register(StockSymbol)
class StockSymbolAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "market")
    search_fields = ("code", "name")
    list_filter = ("market",)


@admin.register(UserStockStorage)
class UserStockStorageAdmin(admin.ModelAdmin):
    list_display = ("user", "selected_group_id", "updated_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("updated_at",)


@admin.register(ChartDrawingState)
class ChartDrawingStateAdmin(admin.ModelAdmin):
    list_display = ("user", "stock_code", "drawing_count", "updated_at")
    search_fields = ("user__username", "user__email", "stock_code")
    list_filter = ("updated_at",)
    readonly_fields = ("updated_at",)

    def drawing_count(self, obj):
        return len(obj.drawings or [])

    drawing_count.short_description = "드로잉 수"
