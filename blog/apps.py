import os
from django.apps import AppConfig


class BlogConfig(AppConfig):
    name = 'blog'

    def ready(self):
        # Only run in the main server process, not the autoreloader watcher
        if os.environ.get('RUN_MAIN') != 'true':
            return
        from django.core.management import call_command
        from django.db import connection, OperationalError
        try:
            connection.ensure_connection()
            call_command('migrate', verbosity=1)
            self._seed_defaults()
        except OperationalError as e:
            print(f"\n[Threadline] Could not connect to database: {e}")
            print("[Threadline] Check your PostgreSQL credentials in settings.py\n")

    def _seed_defaults(self):
        from django.contrib.auth.models import User
        from blog.models import UserProfile
        for username, password, is_mod in [
            ('moderator', 'Mod@1234', True),
            ('alice',     'Alice@1234', False),
        ]:
            if not User.objects.filter(username=username).exists():
                u = User.objects.create_user(username, password=password, is_staff=is_mod)
                UserProfile.objects.create(user=u, is_moderator=is_mod)
                print(f"[Threadline] Created default user '{username}'")
