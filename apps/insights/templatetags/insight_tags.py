from django import template
from django.utils import timezone

from apps.insights.models import InsightPost

register = template.Library()


@register.inclusion_tag("insights/_insight_carousel.html", takes_context=True)
def bitgak_insight_carousel(context, limit=8):
    now = timezone.now()

    insights = list(
        InsightPost.objects.filter(
            is_published=True,
            is_featured=True,
            published_at__lte=now,
        ).order_by(
            "display_order",
            "-published_at",
            "-created_at",
        )[:limit]
    )

    return {
        "insights": insights,
        "request": context.get("request"),
    }
