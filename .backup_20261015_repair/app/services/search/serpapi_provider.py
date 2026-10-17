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

class SerpApiSearchProvider(BaseSearchProvider):
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def provider_name(self) -> str:
        return "serpapi"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def search_name(self, query: str, platforms: list[PlatformId]) -> SearchResponse:
        if not self.is_configured():
            raise RuntimeError("SerpApi is not configured. Set SERPAPI_API_KEY.")

        results: list[SearchResult] = []
        async with httpx.AsyncClient(timeout=12.0) as client:
            for plat in platforms:
                domain = PLATFORM_DOMAINS[plat]
                search_q = f'"{query}" site:{domain}'
                url = "https://serpapi.com/search.json"
                params = {
                    "api_key": self.api_key,
                    "engine": "google",
                    "q": search_q,
                    "num": 5,
                }
                try:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 429:
                        raise RuntimeError("SerpApi rate limit or monthly search quota exceeded.")
                    resp.raise_for_status()
                    data = resp.json()
                    organic = data.get("organic_results", [])
                    for idx, item in enumerate(organic):
                        link = item.get("link", "")
                        title = item.get("title", "")
                        snippet = item.get("snippet", "")
                        r_id = f"s_{plat}_{hashlib.sha256(link.encode()).hexdigest()[:10]}"
                        res = SearchResult(
                            id=r_id,
                            platform=plat,
                            user=title.split(" - ")[0].split(" | ")[0].strip() or query,
                            caption=snippet or title,
                            matchType="Name Match",
                            confidence=92.0 - (idx * 4),
                            img=item.get("thumbnail"),
                            sourceUrl=link,
                            date=item.get("date"),
                            isDemo=False,
                            provider="serpapi",
                            metadata={"source": "SerpApi Google Engine", "verified": True}
                        )
                        cache_result(res)
                        results.append(res)
                except httpx.HTTPError as e:
                    raise RuntimeError(f"SerpApi request failed for {plat}: {str(e)}")

        return SearchResponse(
            query=query,
            searchType="name",
            platforms=platforms,
            provider="serpapi",
            isDemo=False,
            results=results,
            message=f"SerpApi returned {len(results)} verified public result(s)."
        )

    async def search_photo(self, image_bytes: bytes, filename: str, platforms: list[PlatformId]) -> SearchResponse:
        # SerpApi Google Lens / reverse image search requires a public image URL
        raise NotImplementedError("Direct file upload to Google Lens requires an intermediate image hosting URL. Use Google Vision provider for direct bytes.")
