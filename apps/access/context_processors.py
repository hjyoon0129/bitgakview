from .services import get_access_payload, premium_stats


def bitgak_access(request):
    return {
        "bitgak_access": get_access_payload(request.user),
        "premium_application_stats": premium_stats(),
    }
