"""
Run this script once to create the PostgreSQL database and all tables.
Usage: python setup_db.py
"""
import os
import sys
import getpass
import secrets
import subprocess

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    print("psycopg2 not found. Run: pip install psycopg2-binary")
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_NAME = "threadline"
DB_USER = "postgres"
DB_PASSWORD = "post007"
DB_HOST = "localhost"
DB_PORT = "5432"
ADMIN_USER = "postgres"


def create_env_file():
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        print("[skip] .env already exists")
        return
    secret_key = secrets.token_urlsafe(50)
    content = (
        f"SECRET_KEY={secret_key}\n"
        f"DEBUG=True\n"
        f"ALLOWED_HOSTS=127.0.0.1,localhost\n\n"
        f"DB_NAME={DB_NAME}\n"
        f"DB_USER={DB_USER}\n"
        f"DB_PASSWORD={DB_PASSWORD}\n"
        f"DB_HOST={DB_HOST}\n"
        f"DB_PORT={DB_PORT}\n"
    )
    with open(env_path, "w") as f:
        f.write(content)
    print("[ok]   Created .env with generated SECRET_KEY")


def setup_database(admin_password):
    print(f"\nConnecting to PostgreSQL as '{ADMIN_USER}'...")
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user=ADMIN_USER,
            password=admin_password,
            host=DB_HOST,
            port=DB_PORT,
        )
    except psycopg2.OperationalError as e:
        print(f"[error] Cannot connect to PostgreSQL: {e}")
        return False

    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
    if cur.fetchone():
        print(f"[skip] Database '{DB_NAME}' already exists")
    else:
        cur.execute(
            sql.SQL("CREATE DATABASE {} OWNER {}").format(
                sql.Identifier(DB_NAME), sql.Identifier(DB_USER)
            )
        )
        print(f"[ok]   Created database '{DB_NAME}'")

    cur.close()
    conn.close()
    return True


def run_migrations():
    manage = os.path.join(BASE_DIR, "manage.py")
    print("\nRunning migrations...")
    result = subprocess.run([sys.executable, manage, "migrate"], cwd=BASE_DIR)
    return result.returncode == 0


def seed_users():
    manage = os.path.join(BASE_DIR, "manage.py")
    print("\nSeeding demo users...")
    result = subprocess.run([sys.executable, manage, "seed_users"], cwd=BASE_DIR)
    return result.returncode == 0


if __name__ == "__main__":
    print("=== Threadline Blog — Database Setup ===\n")

    create_env_file()

    admin_pass = getpass.getpass(f"Enter PostgreSQL '{ADMIN_USER}' password: ")

    if not setup_database(admin_pass):
        sys.exit(1)

    if not run_migrations():
        print("\n[error] Migration failed.")
        sys.exit(1)

    seed_users()

    print("\n=== Setup complete! ===")
    print("Start the server:  python manage.py runserver")
