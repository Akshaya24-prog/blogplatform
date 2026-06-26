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

## Local Setup

**First time only** — creates the database and all tables automatically:

```bash
python setup_db.py
```

This will prompt for your PostgreSQL password, create the `threadline` database, and run all migrations. It also creates a `.env` file if one doesn't exist.

Then start the server:

```bash
python manage.py runserver
```

Open http://127.0.0.1:8000 in your browser.

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `True` for local, `False` for production |
| `ALLOWED_HOSTS` | Comma-separated hostnames |
| `DB_NAME` | PostgreSQL database name |
| `DB_USER` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_HOST` | Database host |
| `DB_PORT` | Database port |

On Render, set `DATABASE_URL` (from Neon) instead of the individual `DB_*` variables.

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
