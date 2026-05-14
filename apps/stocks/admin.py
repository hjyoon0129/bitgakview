from django.contrib import admin
from .models import StockSymbol


@admin.register(StockSymbol)
class StockSymbolAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "market")
    search_fields = ("code", "name")
    list_filter = ("market",)