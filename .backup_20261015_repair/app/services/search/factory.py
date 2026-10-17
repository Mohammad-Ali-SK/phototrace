from typing import Any
from ...config import settings
from .base import BaseSearchProvider
from .mock_provider import MockSearchProvider
from .google_provider import GoogleSearchProvider
from .bing_provider import BingSearchProvider
from .serpapi_provider import SerpApiSearchProvider

def get_search_provider() -> BaseSearchProvider:
    pref = getattr(settings, 'search_provider', 'auto').lower()

    google = GoogleSearchProvider(
        api_key=getattr(settings, 'google_search_api_key', None),
        cx=getattr(settings, 'google_search_cx', None),
        vision_key=getattr(settings, 'google_vision_api_key', None)
    )
    bing = BingSearchProvider(api_key=getattr(settings, 'bing_search_api_key', None))
    serpapi = SerpApiSearchProvider(api_key=getattr(settings, 'serpapi_api_key', None))

    if pref == 'google' and google.is_configured():
        return google
    if pref == 'bing' and bing.is_configured():
        return bing
    if pref == 'serpapi' and serpapi.is_configured():
        return serpapi

    if pref == 'auto':
        if google.is_configured():
            return google
        if bing.is_configured():
            return bing
        if serpapi.is_configured():
            return serpapi

    return MockSearchProvider()

def get_provider_status() -> dict[str, Any]:
    active = get_search_provider()
    google = GoogleSearchProvider(
        api_key=getattr(settings, 'google_search_api_key', None),
        cx=getattr(settings, 'google_search_cx', None),
        vision_key=getattr(settings, 'google_vision_api_key', None)
    )
    bing = BingSearchProvider(api_key=getattr(settings, 'bing_search_api_key', None))
    serpapi = SerpApiSearchProvider(api_key=getattr(settings, 'serpapi_api_key', None))

    return {
        "active_provider": active.provider_name(),
        "is_live": active.provider_name() != "demo",
        "providers": {
            "demo": {"configured": True, "name": "Illustrative Demo Dataset", "live": False},
            "google": {"configured": google.is_configured(), "name": "Google Custom Search & Vision", "live": True},
            "bing": {"configured": bing.is_configured(), "name": "Microsoft Bing Search", "live": True},
            "serpapi": {"configured": serpapi.is_configured(), "name": "SerpApi Google Engine", "live": True},
        },
        "instructions": (
            "Currently operating in Demo mode with clearly labeled illustrative results. "
            "To connect live public searching: configure GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX (and optional GOOGLE_VISION_API_KEY for reverse-image), "
            "or BING_SEARCH_API_KEY, or SERPAPI_API_KEY in backend/.env."
        )
    }
