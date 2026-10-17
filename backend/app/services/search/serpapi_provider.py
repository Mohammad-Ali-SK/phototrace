import asyncio
import hashlib
import io
from typing import Optional
from urllib.parse import urlparse
import httpx
from PIL import Image, ImageOps
from .base import BaseSearchProvider, PlatformId, SearchResponse, SearchResult
from .mock_provider import cache_result
from .identity_resolver import enrich_results_with_avatars

PLATFORM_DOMAINS: dict[PlatformId, str] = {
    'tiktok': 'tiktok.com',
    'instagram': 'instagram.com',
    'facebook': 'facebook.com',
    'linkedin': 'linkedin.com',
}

def normalize_platform_from_url(url: Optional[str]) -> str:
    if not url or not isinstance(url, str):
        return 'other'
    try:
        parsed = urlparse(url.strip())
        host = parsed.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        if host == "instagram.com" or host.endswith(".instagram.com"):
            return "instagram"
        if host == "facebook.com" or host.endswith(".facebook.com"):
            return "facebook"
        if host == "tiktok.com" or host.endswith(".tiktok.com"):
            return "tiktok"
        if host == "linkedin.com" or host.endswith(".linkedin.com"):
            return "linkedin"
    except Exception:
        pass
    return 'other'

def _clean_img_url(val: object) -> Optional[str]:
    if isinstance(val, str):
        cleaned = val.strip()
        if cleaned.startswith("//"):
            cleaned = f"https:{cleaned}"
        if cleaned.startswith(("http://", "https://", "data:image/")):
            return cleaned
    elif isinstance(val, dict):
        for k in ("src", "thumbnail", "url", "image", "link", "original", "contentUrl", "contenturl", "photo"):
            sub = val.get(k)
            if isinstance(sub, str):
                cleaned = sub.strip()
                if cleaned.startswith("//"):
                    cleaned = f"https:{cleaned}"
                if cleaned.startswith(("http://", "https://", "data:image/")):
                    return cleaned
    return None

def extract_serpapi_image(item: dict) -> Optional[str]:
    if not isinstance(item, dict):
        return None

    # 1. Direct thumbnail or image field
    for field in ("thumbnail", "image", "primary_image"):
        clean = _clean_img_url(item.get(field))
        if clean:
            return clean

    # 2. Thumbnails array
    thumbs = item.get("thumbnails")
    if isinstance(thumbs, list):
        for t in thumbs:
            clean = _clean_img_url(t)
            if clean:
                return clean

    # 3. Rich snippet (top or bottom or nested extensions)
    rich = item.get("rich_snippet")
    if isinstance(rich, dict):
        for section in ("top", "bottom"):
            sub = rich.get(section)
            if isinstance(sub, dict):
                clean = _clean_img_url(sub.get("thumbnail")) or _clean_img_url(sub.get("image"))
                if clean:
                    return clean
                nested_thumbs = sub.get("thumbnails")
                if isinstance(nested_thumbs, list):
                    for nt in nested_thumbs:
                        clean = _clean_img_url(nt)
                        if clean:
                            return clean

    # 4. Inline images or images array
    for img_key in ("inline_images", "images"):
        imgs = item.get(img_key)
        if isinstance(imgs, list):
            for entry in imgs:
                clean = _clean_img_url(entry)
                if clean:
                    return clean

    # 5. Pagemap metadata
    pagemap = item.get("pagemap")
    if isinstance(pagemap, dict):
        # cse_thumbnail
        for ct in pagemap.get("cse_thumbnail", []) if isinstance(pagemap.get("cse_thumbnail"), list) else []:
            clean = _clean_img_url(ct)
            if clean:
                return clean

        # cse_image
        for ci in pagemap.get("cse_image", []) if isinstance(pagemap.get("cse_image"), list) else []:
            clean = _clean_img_url(ci)
            if clean:
                return clean

        # metatags (e.g. og:image, twitter:image, image)
        for meta in pagemap.get("metatags", []) if isinstance(pagemap.get("metatags"), list) else []:
            if isinstance(meta, dict):
                clean = (
                    _clean_img_url(meta.get("og:image"))
                    or _clean_img_url(meta.get("twitter:image"))
                    or _clean_img_url(meta.get("image"))
                )
                if clean:
                    return clean

        # hcard
        for hc in pagemap.get("hcard", []) if isinstance(pagemap.get("hcard"), list) else []:
            clean = _clean_img_url(hc)
            if clean:
                return clean

        # imageobject
        for io in pagemap.get("imageobject", []) if isinstance(pagemap.get("imageobject"), list) else []:
            clean = _clean_img_url(io)
            if clean:
                return clean

    return None

class SerpApiSearchProvider(BaseSearchProvider):
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def provider_name(self) -> str:
        return "serpapi"

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    async def search_name(self, query: str, platforms: list[PlatformId]) -> SearchResponse:
        if not self.is_configured():
            raise RuntimeError("SerpApi is not configured. Set SERPAPI_API_KEY in backend/.env.")

        timeout_cfg = httpx.Timeout(10.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            async def fetch_plat(plat: PlatformId) -> list[SearchResult]:
                domain = PLATFORM_DOMAINS.get(plat, f"{plat}.com")
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
                    if resp.status_code in (401, 403):
                        raise RuntimeError("SerpApi authentication failed. Invalid API key.")
                    resp.raise_for_status()
                    data = resp.json()
                    if "error" in data:
                        raise RuntimeError(f"SerpApi error: {data['error']}")
                    organic = data.get("organic_results", [])
                    plat_results: list[SearchResult] = []
                    for idx, item in enumerate(organic):
                        link = (item.get("link") or "").strip()
                        title = item.get("title", "")
                        snippet = item.get("snippet", "")
                        img_url = extract_serpapi_image(item)

                        # Prefer verified source URL for platform identity
                        verified_plat = normalize_platform_from_url(link)
                        target_plat: PlatformId = (
                            verified_plat
                            if verified_plat in ('tiktok', 'instagram', 'facebook', 'linkedin')
                            else 'other'
                        )

                        r_id = f"s_{target_plat}_{hashlib.sha256(link.encode()).hexdigest()[:10]}"
                        res = SearchResult(
                            id=r_id,
                            platform=target_plat,
                            user=title.split(" - ")[0].split(" | ")[0].strip() or query,
                            caption=snippet or title,
                            matchType="Name Match",
                            confidence=0.0,
                            img=img_url,
                            sourceUrl=link,
                            date=item.get("date"),
                            isDemo=False,
                            provider="serpapi",
                            metadata={
                                "source": "SerpApi Google Engine",
                                "verified": True,
                                "has_genuine_avatar": bool(img_url),
                                "targetQueryPlatform": plat,
                            }
                        )
                        cache_result(res)
                        plat_results.append(res)
                    return plat_results
                except httpx.TimeoutException:
                    raise RuntimeError(f"SerpApi request timed out for {plat}.")
                except httpx.HTTPStatusError as e:
                    raise RuntimeError(f"SerpApi returned HTTP {e.response.status_code} for {plat}.")
                except httpx.HTTPError as e:
                    msg = str(e).strip() or type(e).__name__
                    raise RuntimeError(f"SerpApi request failed for {plat}: {msg}")

            tasks = [fetch_plat(plat) for plat in platforms]
            outcomes = await asyncio.gather(*tasks, return_exceptions=True)

        results: list[SearchResult] = []
        errors: list[str] = []
        for outcome in outcomes:
            if isinstance(outcome, Exception):
                errors.append(str(outcome))
            elif isinstance(outcome, list):
                results.extend(outcome)

        # Deduplicate results by canonical sourceUrl
        seen_urls = set()
        unique_results: list[SearchResult] = []
        for r in results:
            canon = (r.source_url or "").strip().lower().rstrip("/")
            key = canon if canon else r.id
            if key not in seen_urls:
                seen_urls.add(key)
                unique_results.append(r)
        results = unique_results

        # Optional public-profile photo enrichment for Facebook, Instagram, and LinkedIn results
        results = await enrich_results_with_avatars(results)

        # If all platform queries failed, raise the error clearly
        if errors and len(errors) == len(platforms):
            raise RuntimeError(f"SerpApi search failed: {errors[0]}")

        msg = f"SerpApi returned {len(results)} verified public result(s)."
        if errors:
            msg += f" (Note: some platforms were unreachable: {', '.join(errors)})"

        return SearchResponse(
            query=query,
            searchType="name",
            platforms=platforms,
            provider="serpapi",
            isDemo=False,
            results=results,
            message=msg
        )

    async def search_photo(
        self,
        image_bytes: bytes,
        filename: str,
        platforms: list[PlatformId],
        is_sample: bool = False,
        name: Optional[str] = None,
    ) -> SearchResponse:
        """
        Performs reverse image search via SerpApi (with optional name query):
        1. Uploads prepared image bytes to POST https://serpapi.com/image to obtain image_id.
        2. Queries GET https://serpapi.com/search with engine=google_lens and image_id.
        3. Parses visual and exact matches, normalizes platform URLs, and filters to selected platforms.
        4. When a name is provided, queries public web results via search_name and combines/deduplicates them.
        5. Applies Identity Resolver enrichment for profile links lacking thumbnails.
        """
        if not self.is_configured():
            raise RuntimeError("SerpApi is not configured. Set SERPAPI_API_KEY in backend/.env.")

        if not image_bytes or len(image_bytes) == 0:
            raise ValueError("No image data provided for search.")

        prepared_bytes, mime_type = _prepare_image_for_serpapi(image_bytes)

        clean_name = (name or "").strip() or None

        timeout_cfg = httpx.Timeout(25.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            # 1. Upload image bytes to SerpApi Image API
            try:
                upload_resp = await client.post(
                    "https://serpapi.com/image",
                    files={"image": (filename or "upload.jpg", prepared_bytes, mime_type)},
                    data={"api_key": self.api_key},
                )
                if upload_resp.status_code == 429:
                    raise RuntimeError("SerpApi quota exceeded or rate limited (HTTP 429).")
                if upload_resp.status_code in (401, 403):
                    raise RuntimeError("SerpApi authentication failed. Check your API key.")
                if upload_resp.status_code != 200:
                    err_detail = "upload failed"
                    try:
                        err_detail = upload_resp.json().get("error", err_detail)
                    except Exception:
                        pass
                    raise RuntimeError(f"SerpApi image upload failed (HTTP {upload_resp.status_code}): {err_detail}")

                upload_data = upload_resp.json()
                image_id = upload_data.get("image_id")
                if not image_id or not isinstance(image_id, str):
                    raise RuntimeError("SerpApi image upload did not return an image ID.")

            except httpx.TimeoutException:
                raise RuntimeError("SerpApi image upload timed out. Please try again.")
            except httpx.HTTPError as e:
                msg = str(e).strip() or type(e).__name__
                raise RuntimeError(f"SerpApi image upload failed: {msg}")

            # 2. Query Google Lens with image_id
            try:
                lens_resp = await client.get(
                    "https://serpapi.com/search",
                    params={
                        "engine": "google_lens",
                        "image_id": image_id,
                        "api_key": self.api_key,
                    },
                )
                if lens_resp.status_code == 429:
                    raise RuntimeError("SerpApi quota exceeded or rate limited (HTTP 429).")
                if lens_resp.status_code in (401, 403):
                    raise RuntimeError("SerpApi authentication failed. Check your API key.")
                if lens_resp.status_code != 200:
                    err_detail = "search failed"
                    try:
                        err_detail = lens_resp.json().get("error", err_detail)
                    except Exception:
                        pass
                    raise RuntimeError(f"SerpApi Google Lens request failed (HTTP {lens_resp.status_code}): {err_detail}")

                lens_data = lens_resp.json()
                if "error" in lens_data:
                    raise RuntimeError(f"SerpApi Google Lens error: {lens_data['error']}")

            except httpx.TimeoutException:
                raise RuntimeError("SerpApi Google Lens search timed out. Please try again.")
            except httpx.HTTPError as e:
                msg = str(e).strip() or type(e).__name__
                raise RuntimeError(f"SerpApi Google Lens request failed: {msg}")

        # 3. Parse and filter visual & exact matches
        matches: list[tuple[dict, str]] = []
        for key in ("exact_matches", "visual_matches"):
            raw_list = lens_data.get(key, [])
            if isinstance(raw_list, list):
                m_type = "Exact Image Match" if key == "exact_matches" else "Similar Image"
                for item in raw_list:
                    if isinstance(item, dict):
                        matches.append((item, m_type))

        results: list[SearchResult] = []
        seen_urls: set[str] = set()

        for item, default_match_type in matches:
            link = (item.get("link") or "").strip()
            if not link:
                continue

            verified_plat = normalize_platform_from_url(link)
            if verified_plat not in platforms:
                continue

            canon = link.lower().rstrip("/")
            if canon in seen_urls:
                continue
            seen_urls.add(canon)

            title = item.get("title") or item.get("source") or "Visual Match"
            source_name = item.get("source") or verified_plat.capitalize()
            user_candidate = (
                title.split(" - ")[0]
                .split(" | ")[0]
                .split(" • ")[0]
                .strip()
            ) or source_name

            img_url = extract_serpapi_image(item)
            r_id = f"sl_{verified_plat}_{hashlib.sha256(link.encode()).hexdigest()[:10]}"

            res = SearchResult(
                id=r_id,
                platform=verified_plat,
                user=user_candidate,
                caption=title or f"Public image match on {verified_plat.capitalize()}",
                matchType=default_match_type,
                confidence=0.0,
                img=img_url,
                sourceUrl=link,
                date=item.get("date"),
                isDemo=False,
                provider="serpapi",
                metadata={
                    "source": "SerpApi Google Lens",
                    "verified": True,
                    "has_genuine_avatar": bool(img_url),
                    "targetQueryPlatform": verified_plat,
                    "source_name": source_name,
                    "position": item.get("position"),
                    "matchSource": "lens",
                },
            )
            cache_result(res)
            results.append(res)

        # 4. If name was provided, perform name search and merge results
        if clean_name:
            try:
                name_resp = await self.search_name(clean_name, platforms)
                name_results = name_resp.results or []
                for nr in name_results:
                    nr_canon = (nr.source_url or "").strip().lower().rstrip("/")
                    if nr_canon and nr_canon in seen_urls:
                        # Find existing lens result to annotate that it matched both image and name
                        for existing in results:
                            if (existing.source_url or "").strip().lower().rstrip("/") == nr_canon:
                                existing.metadata["matched_name_query"] = clean_name
                                existing.metadata["has_name_match"] = True
                        continue
                    if nr_canon:
                        seen_urls.add(nr_canon)
                    # Label standalone name match from combined search clearly
                    combined_nr = nr.model_copy()
                    combined_nr.match_type = "Name Match"
                    combined_nr.metadata = {
                        **(combined_nr.metadata or {}),
                        "matched_name_query": clean_name,
                        "matchSource": "name_query",
                    }
                    cache_result(combined_nr)
                    results.append(combined_nr)
            except Exception:
                # Name search failure shouldn't crash the image search
                pass

        # 5. Ranking: where practical, prioritize results containing both the supplied name
        # and image evidence higher, without inventing confidence scores
        if clean_name:
            name_lower = clean_name.lower()
            name_tokens = [t for t in name_lower.split() if len(t) >= 2]

            def rank_key(r: SearchResult) -> tuple[int, int]:
                # 0: Lens match with name in title/user/caption (both image + name evidence)
                # 1: Lens match without name
                # 2: Name match without image match
                user_cap = f"{r.user} {r.caption}".lower()
                has_name = r.metadata.get("has_name_match", False) or any(t in user_cap for t in name_tokens)
                is_lens = r.metadata.get("matchSource") == "lens" or r.match_type in ("Exact Image Match", "Similar Image")

                if is_lens and has_name:
                    tier = 0
                elif is_lens:
                    tier = 1
                else:
                    tier = 2

                exact_prio = 0 if r.match_type == "Exact Image Match" else 1
                return (tier, exact_prio)

            results.sort(key=rank_key)

        # 6. Optional Identity Resolver enrichment for profile links lacking thumbnails
        results = await enrich_results_with_avatars(results)

        query_display = f"{filename} + {clean_name}" if clean_name else filename
        msg = f"SerpApi returned {len(results)} verified public result(s)."
        if not results:
            msg = "No matching public results found on the selected platforms."

        return SearchResponse(
            query=query_display,
            searchType="photo",
            platforms=platforms,
            provider="serpapi",
            isDemo=False,
            results=results,
            message=msg,
        )


def _prepare_image_for_serpapi(image_bytes: bytes, max_bytes: int = 490 * 1024) -> tuple[bytes, str]:
    """
    Ensures image bytes fit within SerpApi's 500 KB upload limit and are upright (EXIF transposed).
    If larger or oriented via EXIF, safely transposes, downsamples, or compresses in-memory using PIL.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            fmt = (img.format or "JPEG").upper()
            exif = img.getexif()
            orientation = exif.get(0x0112)

            # If within size limit, has no orientation tag (or normal orientation 1), preserve raw bytes
            if len(image_bytes) <= max_bytes and (orientation is None or orientation == 1):
                mime = "image/png" if fmt == "PNG" else "image/webp" if fmt == "WEBP" else "image/jpeg"
                return image_bytes, mime

            # Transpose to physical upright pixels
            transposed = ImageOps.exif_transpose(img)
            if transposed.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", transposed.size, (255, 255, 255))
                if transposed.mode == "P":
                    transposed = transposed.convert("RGBA")
                background.paste(transposed, mask=transposed.split()[-1] if "A" in transposed.mode else None)
                im = background
            else:
                im = transposed.convert("RGB")

            cur = im
            q = 85
            val = image_bytes
            for _ in range(5):
                out = io.BytesIO()
                cur.save(out, format="JPEG", quality=q, optimize=True)
                val = out.getvalue()
                if len(val) <= max_bytes:
                    return val, "image/jpeg"
                w, h = cur.size
                cur = cur.resize((max(10, int(w * 0.75)), max(10, int(h * 0.75))), Image.Resampling.LANCZOS)
                q = max(50, q - 10)
            return val, "image/jpeg"
    except Exception:
        return image_bytes, "image/jpeg"

