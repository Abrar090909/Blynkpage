"""Marketing site URL patterns."""
from django.urls import path, re_path
from .views import index

urlpatterns = [
    # Catch-all: let React Router handle client-side routing
    re_path(r'^.*$', index, name='index'),
]
