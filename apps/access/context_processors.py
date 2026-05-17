from .services import get_access_payload


def bitgak_access(request):
    return {
        "bitgak_access": get_access_payload(request.user),
    }
