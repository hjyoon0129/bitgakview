from django.db import models
from django.utils import timezone


class VisitLog(models.Model):
    BOT_STATUS_CHOICES = [
        ("human", "Human"),
        ("bot", "Bot"),
        ("suspicious", "Suspicious"),
        ("blocked", "Blocked"),
    ]

    ip_address = models.GenericIPAddressField(null=True, blank=True, db_index=True)
    path = models.CharField(max_length=500, db_index=True)
    method = models.CharField(max_length=10, default="GET")
    user_agent = models.TextField(blank=True)
    user_agent_hash = models.CharField(max_length=64, blank=True, db_index=True)
    referer = models.TextField(blank=True)
    status_code = models.IntegerField(null=True, blank=True)

    bot_status = models.CharField(
        max_length=20,
        choices=BOT_STATUS_CHOICES,
        default="human",
        db_index=True,
    )
    reason = models.CharField(max_length=255, blank=True)

    request_count = models.PositiveIntegerField(default=1)
    visit_date = models.DateField(default=timezone.localdate, db_index=True)
    first_seen_at = models.DateTimeField(default=timezone.now, db_index=True)
    last_seen_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-last_seen_at", "-created_at"]
        indexes = [
            models.Index(fields=["visit_date", "bot_status"]),
            models.Index(fields=["visit_date", "ip_address"]),
            models.Index(fields=["visit_date", "path"]),
            models.Index(fields=["ip_address", "path", "visit_date"]),
            models.Index(fields=["last_seen_at"]),
        ]
        verbose_name = "Visit Log"
        verbose_name_plural = "Visit Logs"

    def __str__(self):
        return f"{self.ip_address} {self.path} {self.bot_status} x{self.request_count}"
