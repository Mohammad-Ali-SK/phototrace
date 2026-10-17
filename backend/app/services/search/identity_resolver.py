import asyncio
import logging
from typing import Optional
from urllib.parse import parse_qs, urlparse
import httpx
from .base import PlatformId, SearchResult
from .mock_provider import cache_result

logger = logging.getLogger(__name__)

RESOLVER_ENDPOINT = "https://ai.mihajlo.mk/api/identity-resolver/v1/resolve"
ENRICHABLE_PLATFORMS: set[PlatformId] = {"facebook", "instagram", "linkedin"}

# Disallowed paths that are articles, posts, directories, or media rather than public profiles
DISALLOWED_LINKEDIN_ROOTS = {
    "pulse", "posts", "feed", "news", "newsletters", "learning",
    "jobs", "pub", "events", "video", "search", "share",
}
DISALLOWED_FB_ROOTS = {
    "posts", "photos", "videos", "watch", "story.php", "groups",
    "events", "hashtag", "help", "login", "recover", "pages",
    "share", "sharer", "dialog",
}
DISALLOWED_IG_ROOTS = {
    "p", "reel", "reels", "tv", "stories", "explore", "accounts",
    "direct", "developer", "about", "legal", "api",
}


def normalize_enrichment_url(platform: PlatformId, source_url: str) -> Optional[str]:
    """
    Normalizes a public source URL for Identity Resolver consumption.
    - Strips tracking query parameters and fragments.
    - Standardizes country subdomains (e.g. pk.linkedin.com -> www.linkedin.com).
    - Verifies URL is a supported public profile path (/in/, /company/ for LinkedIn;
      public vanity / profile.php for Facebook; /{username} for Instagram).
    - Returns None for non-profile URLs (articles, posts, media, directory searches)
      to prevent redundant network requests and 400 errors.
    """
    if platform not in ENRICHABLE_PLATFORMS:
        return None
    if not source_url or not isinstance(source_url, str):
        return None

    cleaned = source_url.strip()
    if not cleaned.startswith(("http://", "https://")):
        return None

    try:
        parsed = urlparse(cleaned)
    except Exception:
        return None

    host = (parsed.hostname or "").lower()
    path = parsed.path or "/"
    trimmed_path = path.rstrip("/")
    parts = [p for p in trimmed_path.split("/") if p]

    if platform == "linkedin":
        # Check domain suffix
        if not (host == "linkedin.com" or host.endswith(".linkedin.com")):
            return None
        if not parts:
            return None
        root = parts[0].lower()
        if root not in ("in", "company"):
            return None
        if len(parts) < 2:
            return None
        # Normalize country subdomain (e.g. pk.linkedin.com, in.linkedin.com) to www.linkedin.com
        return f"https://www.linkedin.com/{root}/{parts[1]}"

    elif platform == "facebook":
        if not (host == "facebook.com" or host.endswith(".facebook.com")):
            return None
        if not parts:
            return None
        root = parts[0].lower()
        if root == "profile.php":
            qs = parse_qs(parsed.query)
            if "id" in qs and qs["id"]:
                return f"https://www.facebook.com/profile.php?id={qs['id'][0]}"
            return None
        if root in DISALLOWED_FB_ROOTS:
            return None
        if len(parts) == 1:
            return f"https://www.facebook.com/{parts[0]}"
        return None

    elif platform == "instagram":
        if not (host == "instagram.com" or host.endswith(".instagram.com")):
            return None
        if not parts:
            return None
        root = parts[0].lower()
        if root in DISALLOWED_IG_ROOTS:
            return None
        if len(parts) == 1:
            return f"https://www.instagram.com/{parts[0]}"
        return None

    return None


async def resolve_identity_avatar(
    client: httpx.AsyncClient,
    platform: PlatformId,
    source_url: str,
) -> Optional[str]:
    """
    Queries Identity Resolver API to fetch a genuine cached public profile picture
    for a supported platform source URL.
    Returns the avatar/picture URL if resolved, or None.
    """
    if platform not in ENRICHABLE_PLATFORMS:
        return None

    norm_url = normalize_enrichment_url(platform, source_url)
    if not norm_url:
        logger.debug(
            "Skipping non-profile URL for platform=%s, url=%s",
            platform,
            source_url[:60] if source_url else "",
        )
        return None

    orig_host = (urlparse(source_url).hostname or "").lower()

    try:
        resp = await client.get(
            RESOLVER_ENDPOINT,
            params={"platform": platform, "url": norm_url},
        )
        status = resp.status_code

        if status == 200:
            data = resp.json()
            if isinstance(data, dict) and data.get("ok"):
                for field in ("avatar", "picture"):
                    val = data.get(field)
                    if isinstance(val, str):
                        cleaned_val = val.strip()
                        if cleaned_val.startswith(("http://", "https://")):
                            logger.info(
                                "Identity Resolver success: platform=%s, host=%s -> avatar resolved",
                                platform,
                                orig_host,
                            )
                            return cleaned_val
            logger.debug(
                "Identity Resolver 200 without avatar: platform=%s, host=%s",
                platform,
                orig_host,
            )
            return None
        elif status == 422:
            logger.debug(
                "Identity Resolver unresolved profile (422): platform=%s, host=%s",
                platform,
                orig_host,
            )
            return None
        else:
            logger.debug(
                "Identity Resolver HTTP %d: platform=%s, host=%s",
                status,
                platform,
                orig_host,
            )
            return None
    except httpx.TimeoutException:
        logger.debug(
            "Identity Resolver timeout: platform=%s, host=%s",
            platform,
            orig_host,
        )
    except Exception as exc:
        logger.debug(
            "Identity Resolver network error (%s): platform=%s, host=%s",
            type(exc).__name__,
            platform,
            orig_host,
        )
    return None


async def enrich_results_with_avatars(
    results: list[SearchResult],
    timeout_seconds: float = 3.5,
) -> list[SearchResult]:
    """
    Enriches public search results lacking images with verified public profile
    thumbnails via Identity Resolver.
    - Facebook, Instagram, and LinkedIn only.
    - Preserves existing images, result ordering, and ranking.
    - Operates concurrently and avoids duplicate requests for identical URLs.
    - Never raises errors on enrichment failure.
    """
    # Filter candidates: must lack image, belong to enrichable platform, and have a valid public profile URL
    candidates: list[tuple[SearchResult, str]] = []
    for r in results:
        if not r.img and r.platform in ENRICHABLE_PLATFORMS and r.source_url:
            norm = normalize_enrichment_url(r.platform, r.source_url)
            if norm:
                candidates.append((r, norm))

    if not candidates:
        logger.debug(
            "No eligible profile candidates for photo enrichment out of %d total results",
            len(results),
        )
        return results

    # Deduplicate normalized URLs within this search run to prevent redundant requests
    url_to_candidates: dict[str, list[SearchResult]] = {}
    for r, norm in candidates:
        url_to_candidates.setdefault(norm, []).append(r)

    logger.info(
        "Enriching %d candidate result(s) (%d unique URLs) out of %d total search results",
        len(candidates),
        len(url_to_candidates),
        len(results),
    )

    timeout = httpx.Timeout(timeout_seconds, connect=2.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            tasks = [
                resolve_identity_avatar(client, items[0].platform, norm_url)
                for norm_url, items in url_to_candidates.items()
            ]
            outcomes = await asyncio.gather(*tasks, return_exceptions=True)

            enriched_count = 0
            for (norm_url, items), outcome in zip(url_to_candidates.items(), outcomes):
                if isinstance(outcome, str) and outcome:
                    enriched_count += len(items)
                    for item in items:
                        item.img = outcome
                        item.metadata["photo_enriched_by"] = "identity-resolver"
                        item.metadata["has_genuine_avatar"] = True
                        cache_result(item)

            logger.info(
                "Enrichment completed: %d result(s) updated with genuine profile photos",
                enriched_count,
            )
    except Exception as exc:
        logger.warning("Enrichment batch error (%s), continuing with existing results", type(exc).__name__)

    return results

