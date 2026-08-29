"""Marketing site views — serves the React SPA shell."""
from django.shortcuts import render


def index(request):
    """Marketing page — React SPA shell served by Django for SEO + routing."""
    return render(request, 'marketing/index.html')
