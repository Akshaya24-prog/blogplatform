#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def ensure_database_exists():
    """Connect to PostgreSQL as the default 'postgres' DB and create the app DB if missing."""
    try:
        import importlib
        settings_mod = importlib.import_module(
            os.environ.get('DJANGO_SETTINGS_MODULE', 'blogplatform.settings')
        )
        db = settings_mod.DATABASES['default']
        if 'postgresql' not in db.get('ENGINE', ''):
            return

        db_name = db['NAME']
        user     = db.get('USER', 'postgres')
        password = db.get('PASSWORD', 'post007')
        host     = db.get('HOST', 'localhost')
        port     = int(db.get('PORT', 5432))

        # Try psycopg (v3) first, fall back to psycopg2
        try:
            import psycopg as pg
            conn = pg.connect(dbname='postgres', user=user, password=password,
                              host=host, port=port, autocommit=True)
        except ImportError:
            import psycopg2 as pg
            conn = pg.connect(dbname='postgres', user=user, password=password,
                              host=host, port=port)
            conn.autocommit = True

        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
            if not cur.fetchone():
                cur.execute(f'CREATE DATABASE "{db_name}"')
                print(f"[Threadline] Created database '{db_name}'.")
        conn.close()

    except Exception as e:
        print(f"[Threadline] Could not auto-create database: {e}")


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'blogplatform.settings')
    ensure_database_exists()
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
