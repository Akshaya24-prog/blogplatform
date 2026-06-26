class TokenAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = request.headers.get('X-Auth-Token', '')
        if key:
            try:
                from blog.models import UserToken
                request.user = UserToken.objects.select_related('user').get(key=key).user
            except UserToken.DoesNotExist:
                pass
        return self.get_response(request)
