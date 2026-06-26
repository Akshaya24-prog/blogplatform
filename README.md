# Threadline — Blog Platform

Full-stack blog platform built with Django + Vanilla JS + PostgreSQL.

## Tech Stack

| Component | Version |
|-----------|---------|
| Python | 3.13.9 (Anaconda) |
| Django | 5.1.15 |
| django-cors-headers | 4.9.0 |
| Pillow | 12.0.0 |
| psycopg2 | 2.9.12 |
| PostgreSQL | 18.4 |
| Frontend | Vanilla JS + HTML + CSS (no build step) |

## Demo Accounts

| Role | Username | Password |
|------|----------|----------|
| Moderator | `moderator` | `Mod@1234` |
| User | `alice` | `Alice@1234` |
| User | `bob` | `Bob@1234` |

## Features

- **Public browsing** — posts visible without login
- **Auth** — register/login/logout; session-based
- **Posts** — create with image + file attachment, edit, delete
- **Comments** — Reddit-style threaded replies (infinite depth)
- **Votes** — like/dislike on comments; like on posts
- **Search** — real-time keyword search
- **User profiles** — view post + comment history; edit/delete own content
- **Moderator panel** — users table, all posts, all comments with delete

## Database Setup

Create the database in PostgreSQL before running the app:

```sql
CREATE DATABASE threadline;
```

Then update `blogplatform/settings.py` with your credentials:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'threadline',
        'USER': 'postgres',       # your PostgreSQL username
        'PASSWORD': '',           # your PostgreSQL password
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

## Setup

Open **Anaconda Prompt**, `cd` into the project folder, then run:

```bash
# Run migrations (first time only)
python manage.py migrate

# Start server — serves both frontend and backend on port 8000
python manage.py runserver
```

Open http://127.0.0.1:8000 in your browser.

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| POST | /api/auth/register/ | Register |
| POST | /api/auth/login/ | Login |
| POST | /api/auth/logout/ | Logout |
| GET | /api/auth/me/ | Current user |
| GET/POST | /api/posts/ | List / create posts |
| GET/PUT/DELETE | /api/posts/{id}/ | Post detail |
| POST | /api/posts/{id}/like/ | Toggle post like |
| GET/POST | /api/posts/{id}/comments/ | List / add comments |
| PUT/DELETE | /api/comments/{id}/ | Edit / delete comment |
| POST | /api/comments/{id}/vote/ | Vote on comment |
| GET | /api/users/{username}/history/ | User history |
| GET | /api/mod/users/ | [MOD] All users |
| GET | /api/mod/posts/ | [MOD] All posts |
| GET | /api/mod/comments/ | [MOD] All comments |
