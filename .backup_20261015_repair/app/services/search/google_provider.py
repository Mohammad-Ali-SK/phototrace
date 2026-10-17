import base64
import hashlib
import re
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

class GoogleSearchProvider(BaseSearchProvider):
    def __init__(self, api_key: Optional[str] = None, cx: Optional[str] = None, vision_key: Optional[str] = None):
        self.api_key = api_key
        self.cx = cx
        self.vision_key = vision_key or api_key

    def provider_name(self) -> str:
        return "google"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.cx)

    async def search_name(self, query: str, platforms: list[PlatformId]) -> SearchResponse:
        if not self.is_configured():
            raise RuntimeError("Google Custom Search API is not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX.")

        results: list[SearchResult] = []
        async with httpx.AsyncClient(timeout=10.0) as client:
            for plat in platforms:
                domain = PLATFORM_DOMAINS[plat]
                # Scoped query to public platform domain
                # e.g., site:instagram.com "query"
                search_q = f'"{query}" site:{domain}'
                url = "https://www.googleapis.com/customsearch/v1"
                params = {
                    "key": self.api_key,
                    "cx": self.cx,
                    "q": search_q,
                    "num": 5,
                }
                try:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 429:
                        raise RuntimeError("Google Custom Search quota exceeded or rate limited (HTTP 429).")
                    if resp.status_code == 403:
                        raise RuntimeError("Google Custom Search authentication failed or API not enabled (HTTP 403).")
                    resp.raise_for_status()
                    data = resp.json()
                    items = data.get("items", [])
                    for idx, item in enumerate(items):
                        link = item.get("link", "")
                        title = item.get("title", "")
                        snippet = item.get("snippet", "")
                        pagemap = item.get("pagemap", {})
                        # Extract thumbnail if available
                        img_url = None
                        cse_image = pagemap.get("cse_image", [])
                        if cse_image and isinstance(cse_image, list) and len(cse_image) > 0:
                            img_url = cse_image[0].get("src")

                        r_id = f"g_{plat}_{hashlib.sha256(link.encode()).hexdigest()[:10]}"
                        res = SearchResult(
                            id=r_id,
                            platform=plat,
                            user=title.split(" - ")[0].split(" | ")[0].strip() or query,
                            caption=snippet or title,
                            matchType="Name Match",
                            confidence=90.0 - (idx * 5),
                            img=img_url,
                            sourceUrl=link,
                            date=None,
                            isDemo=False,
                            provider="google",
                            metadata={
                                "source": "Google Custom Search JSON API",
                                "query": search_q,
                                "verified": True,
                                "raw_title": title,
                            }
                        )
                        cache_result(res)
                        results.append(res)
                except httpx.HTTPError as e:
                    raise RuntimeError(f"Google Search request failed for {plat}: {str(e)}")

        return SearchResponse(
            query=query,
            searchType="name",
            platforms=platforms,
            provider="google",
            isDemo=False,
            results=results,
            message=f"Google Custom Search returned {len(results)} verified public web result(s)."
        )

    async def search_photo(self, image_bytes: bytes, filename: str, platforms: list[PlatformId]) -> SearchResponse:
        if not self.vision_key:
            raise RuntimeError("Google Cloud Vision API key is not configured. Set GOOGLE_VISION_API_KEY.")

        results: list[SearchResult] = []
        b64_image = base64.b64encode(image_bytes).decode('utf-8')
        url = f"https://vision.googleapis.com/v1/images:annotate?key={self.vision_key}"
        payload = {
            "requests": [
                {
                    "image": {"content": b64_image},
                    "features": [{"type": "WEB_DETECTION", "maxResults": 30}]
                }
            ]
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(url, json=payload)
                if resp.status_code == 429:
                    raise RuntimeError("Google Vision quota exceeded or rate limited (HTTP 429).")
                if resp.status_code == 403:
                    raise RuntimeError("Google Vision authentication failed or API not enabled (HTTP 403).")
                resp.raise_for_status()
                data = resp.json()
                responses = data.get("responses", [])
                if not responses:
                    return SearchResponse(
                        query=filename,
                        searchType="photo",
                        platforms=platforms,
                        provider="google_vision",
                        isDemo=False,
                        results=[],
                        message="No web detection responses received."
                    )

                web_det = responses[0].get("webDetection", {})
                pages_with_images = web_det.get("pagesWithMatchingImages", [])

                for page in pages_with_images:
                    page_url = page.get("url", "")
                    page_title = page.get("pageTitle", "")

                    # Check which platform matches the page URL
                    matched_plat = None
                    for plat in platforms:
                        domain = PLATFORM_DOMAINS[plat]
                        if domain in page_url:
                            matched_plat = plat
                            break

                    if not matched_plat:
                        continue

                    # Extract image url if present
                    full_matches = page.get("fullMatchingImages", [])
                    partial_matches = page.get("partialMatchingImages", [])
                    img_url = None
                    match_type = "Similar Image"
                    conf = 85.0
                    if full_matches:
                        img_url = full_matches[0].get("url")
                        match_type = "Exact Image Match"
                        conf = 96.0
                    elif partial_matches:
                        img_url = partial_matches[0].get("url")
                        match_type = "Similar Image"
                        conf = 80.0

                    r_id = f"gv_{matched_plat}_{hashlib.sha256(page_url.encode()).hexdigest()[:10]}"
                    res = SearchResult(
                        id=r_id,
                        platform=matched_plat,
                        user=page_title.split(" - ")[0].split(" | ")[0].strip() or "Social Profile",
                        caption=page_title or f"Public image match on {matched_plat.capitalize()}",
                        matchType=match_type,
                        confidence=conf,
                        img=img_url,
                        sourceUrl=page_url,
                        date=None,
                        isDemo=False,
                        provider="google_vision",
                        metadata={
                            "source": "Google Cloud Vision Web Detection",
                            "verified": True,
                            "page_title": page_title,
                        }
                    )
                    cache_result(res)
                    results.append(res)
            except httpx.HTTPError as e:
                raise RuntimeError(f"Google Vision API request failed: {str(e)}")

        return SearchResponse(
            query=filename,
            searchType="photo",
            platforms=platforms,
            provider="google_vision",
            isDemo=False,
            results=results,
            message=f"Google Cloud Vision discovered {len(results)} public matching page(s)."
        )
