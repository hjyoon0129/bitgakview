from django.db import models
from django.utils import timezone


class VisitLog(models.Model):
    BOT_STATUS_CHOICES = [
        ("human", "Human"),
        ("bot", "Bot"),
        ("suspicious", "Suspicious"),
    ]

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    path = models.CharField(max_length=500)
    method = models.CharField(max_length=10, default="GET")
    user_agent = models.TextField(blank=True)
    referer = models.TextField(blank=True)
    status_code = models.IntegerField(null=True, blank=True)

    bot_status = models.CharField(
        max_length=20,
        choices=BOT_STATUS_CHOICES,
        default="human",
        db_index=True,
    )
    reason = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["ip_address"]),
            models.Index(fields=["bot_status"]),
            models.Index(fields=["path"]),
        ]

    def __str__(self):
        return f"{self.ip_address} {self.path} {self.bot_status}"