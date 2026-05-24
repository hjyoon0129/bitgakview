from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from apps.analytics.models import VisitLog


class Command(BaseCommand):
    help = "Delete VisitLog rows and remove VisitLog entries from Django admin recent actions."

    def handle(self, *args, **options):
        deleted_count, _ = VisitLog.objects.all().delete()

        admin_log_count = 0
        try:
            content_type = ContentType.objects.get_for_model(VisitLog)
            admin_log_count, _ = LogEntry.objects.filter(content_type=content_type).delete()
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f"Admin recent action cleanup skipped: {exc}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted_count} VisitLog rows and {admin_log_count} admin recent action rows."
            )
        )
