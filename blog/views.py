import json
from datetime import timedelta
from django.shortcuts import render, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.core.paginator import Paginator
from .models import Post, Comment, UserProfile, UserToken


def is_moderator(user):
    return user.is_authenticated and (
        user.is_staff or (hasattr(user, 'profile') and user.profile.is_moderator)
    )


def parse_json_body(request):
    try:
        return json.loads(request.body), None
    except (json.JSONDecodeError, ValueError):
        return None, JsonResponse({'error': 'Invalid request body'}, status=400)


@ensure_csrf_cookie
def index(request):
    return render(request, 'index.html')


# ─── AUTH ───────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["POST"])
def api_register(request):
    data, err = parse_json_body(request)
    if err:
        return err
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return JsonResponse({'error': 'Username and password required'}, status=400)
    if any(c.isupper() for c in username):
        return JsonResponse({'error': 'Username cannot contain capital letters'}, status=400)
    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'Username already taken'}, status=400)
    if email and User.objects.filter(email=email).exists():
        return JsonResponse({'error': 'Email already registered'}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    UserProfile.objects.create(user=user)
    login(request, user)
    token = UserToken.create_for(user)
    return JsonResponse({'user': serialize_user(user), 'token': token.key})


@csrf_exempt
@require_http_methods(["POST"])
def api_login(request):
    data, err = parse_json_body(request)
    if err:
        return err
    user = authenticate(request, username=data.get('username'), password=data.get('password'))
    if user:
        login(request, user)
        UserToken.objects.filter(user=user, created_at__lt=timezone.now() - timedelta(days=7)).delete()
        token = UserToken.create_for(user)
        return JsonResponse({'user': serialize_user(user), 'token': token.key})
    return JsonResponse({'error': 'Invalid credentials'}, status=401)


@csrf_exempt
@require_http_methods(["POST"])
def api_logout(request):
    key = request.headers.get('X-Auth-Token', '')
    if key:
        UserToken.objects.filter(key=key).delete()
    logout(request)
    return JsonResponse({'ok': True})


def api_me(request):
    if request.user.is_authenticated:
        return JsonResponse({'user': serialize_user(request.user)})
    return JsonResponse({'user': None})


def serialize_user(user):
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'is_moderator': is_moderator(user),
        'date_joined': user.date_joined.isoformat(),
    }


# ─── POSTS ──────────────────────────────────────────────────────────────────

def api_posts(request):
    if request.method == 'GET':
        page = int(request.GET.get('page', 1))
        search = request.GET.get('q', '').strip()
        qs = Post.objects.select_related('author').all()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(content__icontains=search))
        qs = qs.order_by('-created_at')
        paginator = Paginator(qs, 10)
        pg = paginator.get_page(page)
        return JsonResponse({
            'posts': [serialize_post(p, request.user) for p in pg],
            'has_next': pg.has_next(),
            'total': paginator.count,
        })
    elif request.method == 'POST':
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Login required'}, status=401)
        title = request.POST.get('title', '').strip()
        content = request.POST.get('content', '').strip()
        if not title or not content:
            return JsonResponse({'error': 'Title and content required'}, status=400)
        post = Post(author=request.user, title=title, content=content)
        if 'image' in request.FILES:
            post.image = request.FILES['image']
        elif request.POST.get('image_url'):
            post.image_url = request.POST.get('image_url').strip()
        if 'attachment' in request.FILES:
            f = request.FILES['attachment']
            post.file_attachment = f
            post.file_attachment_name = f.name
        post.save()
        return JsonResponse({'post': serialize_post(post, request.user)}, status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


def api_post_detail(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    if request.method == 'GET':
        return JsonResponse({'post': serialize_post(post, request.user)})
    elif request.method == 'PUT':
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Login required'}, status=401)
        if post.author != request.user and not is_moderator(request.user):
            return JsonResponse({'error': 'Forbidden'}, status=403)
        # Handle multipart or JSON
        if request.content_type and 'multipart' in request.content_type:
            post.title = request.POST.get('title', post.title).strip()
            post.content = request.POST.get('content', post.content).strip()
            if 'image' in request.FILES:
                post.image = request.FILES['image']
                post.image_url = ''
            elif 'image_url' in request.POST:
                post.image_url = request.POST.get('image_url').strip()
                post.image = None
            if 'attachment' in request.FILES:
                f = request.FILES['attachment']
                post.file_attachment = f
                post.file_attachment_name = f.name
        else:
            data, err = parse_json_body(request)
            if err:
                return err
            post.title = data.get('title', post.title).strip()
            post.content = data.get('content', post.content).strip()
        post.save()
        return JsonResponse({'post': serialize_post(post, request.user)})
    elif request.method == 'DELETE':
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Login required'}, status=401)
        if post.author != request.user and not is_moderator(request.user):
            return JsonResponse({'error': 'Forbidden'}, status=403)
        post.delete()
        return JsonResponse({'ok': True})
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_post_like(request, post_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Login required'}, status=401)
    post = get_object_or_404(Post, id=post_id)
    if request.user in post.likes.all():
        post.likes.remove(request.user)
        liked = False
    else:
        post.likes.add(request.user)
        liked = True
    return JsonResponse({'liked': liked, 'count': post.likes.count()})


def serialize_post(post, user):
    liked = user.is_authenticated and user in post.likes.all()
    return {
        'id': post.id,
        'title': post.title,
        'content': post.content,
        'author': post.author.username,
        'author_id': post.author.id,
        'image': post.image.url if post.image else (post.image_url or None),
        'image_url': post.image_url,
        'file_attachment': post.file_attachment.url if post.file_attachment else None,
        'file_attachment_name': post.file_attachment_name,
        'created_at': post.created_at.isoformat(),
        'updated_at': post.updated_at.isoformat(),
        'comment_count': post.comment_count,
        'like_count': post.likes.count(),
        'liked': liked,
    }


# ─── COMMENTS ───────────────────────────────────────────────────────────────

def api_comments(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    if request.method == 'GET':
        top_comments = Comment.objects.filter(post=post, parent=None).select_related('author')
        return JsonResponse({'comments': [serialize_comment(c, request.user) for c in top_comments]})
    elif request.method == 'POST':
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Login required'}, status=401)
        data, err = parse_json_body(request)
        if err:
            return err
        content = data.get('content', '').strip()
        parent_id = data.get('parent_id')
        if not content:
            return JsonResponse({'error': 'Content required'}, status=400)
        parent = None
        if parent_id:
            parent = get_object_or_404(Comment, id=parent_id, post=post)
        comment = Comment.objects.create(post=post, author=request.user, content=content, parent=parent)
        return JsonResponse({'comment': serialize_comment(comment, request.user)}, status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


def api_comment_detail(request, comment_id):
    comment = get_object_or_404(Comment, id=comment_id)
    if request.method == 'PUT':
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Login required'}, status=401)
        if comment.author != request.user and not is_moderator(request.user):
            return JsonResponse({'error': 'Forbidden'}, status=403)
        data, err = parse_json_body(request)
        if err:
            return err
        comment.content = data.get('content', comment.content).strip()
        comment.save()
        return JsonResponse({'comment': serialize_comment(comment, request.user)})
    elif request.method == 'DELETE':
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Login required'}, status=401)
        if comment.author != request.user and not is_moderator(request.user):
            return JsonResponse({'error': 'Forbidden'}, status=403)
        comment.is_deleted = True
        comment.deleted_by = 'poster' if comment.author == request.user else 'moderator'
        comment.save(update_fields=['is_deleted', 'deleted_by'])
        comment.post.update_comment_count()
        return JsonResponse({'ok': True, 'comment': serialize_comment(comment, request.user)})
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_comment_vote(request, comment_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Login required'}, status=401)
    comment = get_object_or_404(Comment, id=comment_id)
    data, err = parse_json_body(request)
    if err:
        return err
    vote = data.get('vote')  # 'like' or 'dislike'
    user_liked = False
    user_disliked = False
    if vote == 'like':
        comment.dislikes.remove(request.user)
        if request.user in comment.likes.all():
            comment.likes.remove(request.user)
        else:
            comment.likes.add(request.user)
            user_liked = True
    elif vote == 'dislike':
        comment.likes.remove(request.user)
        if request.user in comment.dislikes.all():
            comment.dislikes.remove(request.user)
        else:
            comment.dislikes.add(request.user)
            user_disliked = True
    return JsonResponse({
        'likes': comment.likes.count(),
        'dislikes': comment.dislikes.count(),
        'user_liked': user_liked,
        'user_disliked': user_disliked,
    })


def serialize_comment(comment, user):
    replies = [serialize_comment(r, user) for r in comment.replies.all().select_related('author')]
    if comment.is_deleted:
        return {
            'id': comment.id,
            'deleted': True,
            'deleted_by': comment.deleted_by,
            'post_id': comment.post_id,
            'parent_id': comment.parent_id,
            'created_at': comment.created_at.isoformat(),
            'replies': replies,
        }
    return {
        'id': comment.id,
        'deleted': False,
        'content': comment.content,
        'author': comment.author.username,
        'author_id': comment.author.id,
        'post_id': comment.post_id,
        'parent_id': comment.parent_id,
        'created_at': comment.created_at.isoformat(),
        'updated_at': comment.updated_at.isoformat(),
        'likes': comment.likes.count(),
        'dislikes': comment.dislikes.count(),
        'user_liked': user.is_authenticated and user in comment.likes.all(),
        'user_disliked': user.is_authenticated and user in comment.dislikes.all(),
        'replies': replies,
    }


# ─── USER HISTORY ────────────────────────────────────────────────────────────

def api_user_history(request, username):
    target = get_object_or_404(User, username=username)
    posts = Post.objects.filter(author=target).order_by('-created_at')
    comments = Comment.objects.filter(author=target).select_related('post').order_by('-created_at')
    return JsonResponse({
        'user': serialize_user(target),
        'posts': [serialize_post(p, request.user) for p in posts],
        'comments': [serialize_comment(c, request.user) for c in comments],
    })


# ─── MODERATOR ───────────────────────────────────────────────────────────────

def api_mod_users(request):
    if not is_moderator(request.user):
        return JsonResponse({'error': 'Forbidden'}, status=403)
    users = User.objects.all().select_related('profile').order_by('date_joined')
    data = []
    for u in users:
        data.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'date_joined': u.date_joined.isoformat(),
            'is_moderator': is_moderator(u),
            'is_staff': u.is_staff,
            'post_count': u.posts.count(),
            'comment_count': u.comments.count(),
        })
    return JsonResponse({'users': data})


def api_mod_all_posts(request):
    if not is_moderator(request.user):
        return JsonResponse({'error': 'Forbidden'}, status=403)
    posts = Post.objects.select_related('author').order_by('-created_at')
    return JsonResponse({'posts': [serialize_post(p, request.user) for p in posts]})


def api_mod_all_comments(request):
    if not is_moderator(request.user):
        return JsonResponse({'error': 'Forbidden'}, status=403)
    comments = Comment.objects.select_related('author', 'post').order_by('-created_at')
    return JsonResponse({'comments': [serialize_comment(c, request.user) for c in comments]})
