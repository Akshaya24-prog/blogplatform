from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from blog.models import UserProfile

USERS = [
    {"username": "moderator", "password": "Mod@1234",   "email": "moderator@threadline.com", "is_moderator": True},
    {"username": "alice",     "password": "Alice@1234", "email": "alice@threadline.com",     "is_moderator": False},
    {"username": "bob",       "password": "Bob@1234",   "email": "bob@threadline.com",       "is_moderator": False},
]


class Command(BaseCommand):
    help = "Create demo users (skips any that already exist)"

    def handle(self, *args, **kwargs):
        for data in USERS:
            user, created = User.objects.get_or_create(username=data["username"])
            if created:
                user.set_password(data["password"])
                user.email = data["email"]
                user.save()
                UserProfile.objects.get_or_create(
                    user=user,
                    defaults={"is_moderator": data["is_moderator"]},
                )
                self.stdout.write(f"[ok]   Created user '{data['username']}'")
            else:
                self.stdout.write(f"[skip] User '{data['username']}' already exists")
