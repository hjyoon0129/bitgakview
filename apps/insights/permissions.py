MASTER_INSIGHT_EMAILS = {
    "hjyoon0129@gmail.com",
}

MASTER_INSIGHT_USERNAMES = {
    "hjyoon0129",
    "hjyoon0129@gmail.com",
}


def _normal(value):
    return (value or "").strip().lower()


def is_insight_master(user):
    if not user or not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "is_superuser", False):
        return True

    email = _normal(getattr(user, "email", ""))
    username = _normal(getattr(user, "username", ""))

    if email in MASTER_INSIGHT_EMAILS:
        return True

    if username in MASTER_INSIGHT_USERNAMES:
        return True

    # django-allauth social login users can have email stored in EmailAddress
    try:
        from allauth.account.models import EmailAddress

        return EmailAddress.objects.filter(
            user=user,
            email__iexact="hjyoon0129@gmail.com",
        ).exists()
    except Exception:
        return False
