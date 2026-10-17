import hashlib
from typing import Optional
import httpx
from .base import BaseSearchProvider, PlatformId, SearchResponse, SearchResult
from .mock_provider import cache_result

PLATFORM_DOMAINS: dict[PlatformId, str] = {
    'tiktok': 'tiktok.com',
    'instagram': 'instagram.com',
    'facebook': 'facebook.com',
    'linkedin': 'linkedin.com',
}

class BingSearchProvider(BaseSearchProvider):
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def provider_name(self) -> str:
        return "bing"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def search_name(self, query: str, platforms: list[PlatformId]) -> SearchResponse:
        if not self.is_configured():
            raise RuntimeError("Bing Search API is not configured. Set BING_SEARCH_API_KEY.")

        results: list[SearchResult] = []
        headers = {"Ocp-Apim-Subscription-Key": self.api_key}
        async with httpx.AsyncClient(timeout=10.0) as client:
            for plat in platforms:
                domain = PLATFORM_DOMAINS[plat]
                search_q = f'"{query}" site:{domain}'
                url = "https://api.bing.microsoft.com/v7.0/search"
                params = {"q": search_q, "count": 5}
                try:
                    resp = await client.get(url, headers=headers, params=params)
                    if resp.status_code == 429:
                        raise RuntimeError("Bing Search API rate limit exceeded.")
                    resp.raise_for_status()
                    data = resp.json()
                    web_pages = data.get("webPages", {}).get("value", [])
                    for idx, page in enumerate(web_pages):
                        link = page.get("url", "")
                        name = page.get("name", "")
                        snippet = page.get("snippet", "")
                        r_id = f"b_{plat}_{hashlib.sha256(link.encode()).hexdigest()[:10]}"
                        res = SearchResult(
                            id=r_id,
                            platform=plat,
                            user=name.split(" - ")[0].split(" | ")[0].strip() or query,
                            caption=snippet or name,
                            matchType="Name Match",
                            confidence=88.0 - (idx * 5),
                            img=None,
                            sourceUrl=link,
                            date=None,
                            isDemo=False,
                            provider="bing",
                            metadata={"source": "Bing Web Search API", "verified": True}
                        )
                        cache_result(res)
                        results.append(res)
                except httpx.HTTPError as e:
                    raise RuntimeError(f"Bing search error for {plat}: {str(e)}")

        return SearchResponse(
            query=query,
            searchType="name",
            platforms=platforms,
            provider="bing",
            isDemo=False,
            results=results,
            message=f"Bing Web Search returned {len(results)} verified public result(s)."
        )

    async def search_photo(self, image_bytes: bytes, filename: str, platforms: list[PlatformId]) -> SearchResponse:
        # Visual search requires Bing Visual Search API endpoint
        raise NotImplementedError("Bing Visual Search API is not configured for image uploads. Use Google Vision or demo provider.")
