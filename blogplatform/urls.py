from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.views.decorators.csrf import csrf_exempt
from blog import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.index),

    # Auth
    path('api/auth/register/', csrf_exempt(views.api_register)),
    path('api/auth/login/', csrf_exempt(views.api_login)),
    path('api/auth/logout/', csrf_exempt(views.api_logout)),
    path('api/auth/me/', views.api_me),

    # Posts
    path('api/posts/', csrf_exempt(views.api_posts)),
    path('api/posts/<int:post_id>/', csrf_exempt(views.api_post_detail)),
    path('api/posts/<int:post_id>/like/', csrf_exempt(views.api_post_like)),
    path('api/posts/<int:post_id>/comments/', csrf_exempt(views.api_comments)),

    # Comments
    path('api/comments/<int:comment_id>/', csrf_exempt(views.api_comment_detail)),
    path('api/comments/<int:comment_id>/vote/', csrf_exempt(views.api_comment_vote)),

    # User history
    path('api/users/<str:username>/history/', views.api_user_history),

    # Moderator
    path('api/mod/users/', views.api_mod_users),
    path('api/mod/posts/', views.api_mod_all_posts),
    path('api/mod/comments/', views.api_mod_all_comments),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT) \
  + static(settings.STATIC_URL, document_root=settings.BASE_DIR / 'static')
