from django.core.management.base import BaseCommand

from apps.analytics.models import VisitLog


class Command(BaseCommand):
    help = "Delete all VisitLog rows."

    def handle(self, *args, **options):
        deleted_count, _ = VisitLog.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted_count} VisitLog rows."))
