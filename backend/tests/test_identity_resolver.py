import pytest
import httpx
from app.services.search.base import SearchResult
from app.services.search.identity_resolver import (
    resolve_identity_avatar,
    enrich_results_with_avatars,
    normalize_enrichment_url,
    RESOLVER_ENDPOINT,
)
from app.services.search.serpapi_provider import SerpApiSearchProvider

def _make_result(id: str, platform: str, url: str, img: str = None) -> SearchResult:
    return SearchResult(
        id=id,
        platform=platform,
        user=f"User {id}",
        caption="Sample caption",
        matchType="Name Match",
        confidence=0.0,
        img=img,
        sourceUrl=url,
        date="2026-03-01",
        isDemo=False,
        provider="serpapi",
        metadata={"verified": True},
    )

@pytest.mark.anyio
async def test_resolve_identity_avatar_success(monkeypatch):
    async def mock_get(self, url, params=None, **kwargs):
        assert url == RESOLVER_ENDPOINT
        assert params["platform"] == "facebook"
        assert params["url"] == "https://www.facebook.com/zuck"
        return httpx.Response(200, json={
            "ok": True,
            "platform": "facebook",
            "avatar": "https://ai.mihajlo.mk/storage/facebook/zuck.jpg",
            "picture": "https://ai.mihajlo.mk/storage/facebook/zuck.jpg",
        })

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as client:
        avatar = await resolve_identity_avatar(client, "facebook", "https://www.facebook.com/zuck")
        assert avatar == "https://ai.mihajlo.mk/storage/facebook/zuck.jpg"

@pytest.mark.anyio
async def test_resolve_identity_avatar_unresolved_422(monkeypatch):
    async def mock_get(self, url, params=None, **kwargs):
        return httpx.Response(422, json={
            "ok": False,
            "error": {"code": "profile_not_resolved", "message": "Could not resolve"}
        })

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as client:
        avatar = await resolve_identity_avatar(client, "instagram", "https://www.instagram.com/private_user")
        assert avatar is None

@pytest.mark.anyio
async def test_resolve_identity_avatar_timeout(monkeypatch):
    async def mock_get(self, url, params=None, **kwargs):
        raise httpx.ReadTimeout("Request timed out")

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    async with httpx.AsyncClient() as client:
        avatar = await resolve_identity_avatar(client, "linkedin", "https://www.linkedin.com/in/slowuser")
        assert avatar is None

@pytest.mark.anyio
async def test_resolve_identity_avatar_unsupported_platform():
    async with httpx.AsyncClient() as client:
        # TikTok is not supported by Identity Resolver
        avatar = await resolve_identity_avatar(client, "tiktok", "https://www.tiktok.com/@user")
        assert avatar is None

        # Other / general web is not supported
        avatar = await resolve_identity_avatar(client, "other", "https://example.com/user")
        assert avatar is None

@pytest.mark.anyio
async def test_enrich_results_skips_existing_images_and_unsupported_platforms(monkeypatch):
    calls = []

    async def mock_get(self, url, params=None, **kwargs):
        calls.append(params)
        return httpx.Response(200, json={
            "ok": True,
            "avatar": f"https://ai.mihajlo.mk/storage/{params['platform']}/pic.jpg",
        })

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    r_existing = _make_result("1", "facebook", "https://www.facebook.com/existing", img="https://existing.com/pic.jpg")
    r_tiktok = _make_result("2", "tiktok", "https://www.tiktok.com/@tiktokuser")
    r_fb = _make_result("3", "facebook", "https://www.facebook.com/newuser")
    r_ig = _make_result("4", "instagram", "https://www.instagram.com/iguser")

    results = [r_existing, r_tiktok, r_fb, r_ig]
    enriched = await enrich_results_with_avatars(results)

    # Only r_fb and r_ig should have triggered requests
    assert len(calls) == 2
    queried_urls = [c["url"] for c in calls]
    assert "https://www.facebook.com/newuser" in queried_urls
    assert "https://www.instagram.com/iguser" in queried_urls
    assert "https://www.facebook.com/existing" not in queried_urls
    assert "https://www.tiktok.com/@tiktokuser" not in queried_urls

    # r_existing preserved
    assert enriched[0].img == "https://existing.com/pic.jpg"
    # r_tiktok skipped
    assert enriched[1].img is None
    # r_fb enriched
    assert enriched[2].img == "https://ai.mihajlo.mk/storage/facebook/pic.jpg"
    assert enriched[2].metadata.get("photo_enriched_by") == "identity-resolver"
    # r_ig enriched
    assert enriched[3].img == "https://ai.mihajlo.mk/storage/instagram/pic.jpg"
    assert enriched[3].metadata.get("photo_enriched_by") == "identity-resolver"

@pytest.mark.anyio
async def test_enrich_results_deduplicates_duplicate_urls(monkeypatch):
    calls = []

    async def mock_get(self, url, params=None, **kwargs):
        calls.append(params)
        return httpx.Response(200, json={
            "ok": True,
            "avatar": "https://ai.mihajlo.mk/storage/linkedin/profile.jpg",
        })

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    r1 = _make_result("1", "linkedin", "https://www.linkedin.com/in/talha")
    r2 = _make_result("2", "linkedin", "https://www.linkedin.com/in/talha")

    enriched = await enrich_results_with_avatars([r1, r2])

    # Only 1 HTTP call made for the duplicate URL
    assert len(calls) == 1
    assert enriched[0].img == "https://ai.mihajlo.mk/storage/linkedin/profile.jpg"
    assert enriched[1].img == "https://ai.mihajlo.mk/storage/linkedin/profile.jpg"

@pytest.mark.anyio
async def test_serpapi_integration_with_enrichment(monkeypatch):
    provider = SerpApiSearchProvider(api_key="test_serpapi_key")

    async def mock_serpapi_get(self, url, params=None, **kwargs):
        req = httpx.Request("GET", url)
        if "serpapi.com" in url:
            return httpx.Response(200, json={
                "organic_results": [
                    {
                        "title": "Mark Zuckerberg - Facebook",
                        "link": "https://www.facebook.com/zuck",
                        "snippet": "Mark Zuckerberg profile",
                        # No thumbnail in Google organic result
                    }
                ]
            }, request=req)
        elif "identity-resolver" in url:
            return httpx.Response(200, json={
                "ok": True,
                "platform": "facebook",
                "avatar": "https://ai.mihajlo.mk/storage/identity-resolver/facebook/zuck.jpg",
            }, request=req)
        return httpx.Response(404, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_serpapi_get)

    resp = await provider.search_name("Mark Zuckerberg", ["facebook"])
    assert len(resp.results) == 1
    assert resp.results[0].platform == "facebook"
    assert resp.results[0].img == "https://ai.mihajlo.mk/storage/identity-resolver/facebook/zuck.jpg"
    assert resp.results[0].metadata.get("photo_enriched_by") == "identity-resolver"

def test_normalize_enrichment_url():
    # LinkedIn personal profile with country subdomain and query params
    assert (
        normalize_enrichment_url("linkedin", "https://pk.linkedin.com/in/talha?trk=public_profile")
        == "https://www.linkedin.com/in/talha"
    )
    # LinkedIn company URL
    assert (
        normalize_enrichment_url("linkedin", "https://in.linkedin.com/company/microsoft")
        == "https://www.linkedin.com/company/microsoft"
    )
    # Non-profile LinkedIn URLs should be skipped (None)
    assert normalize_enrichment_url("linkedin", "https://www.linkedin.com/pulse/some-article-title") is None
    assert normalize_enrichment_url("linkedin", "https://www.linkedin.com/posts/activity-123") is None
    assert normalize_enrichment_url("linkedin", "https://www.linkedin.com/pub/dir/John/Doe") is None

    # Facebook vanity profile and mobile subdomain
    assert (
        normalize_enrichment_url("facebook", "https://m.facebook.com/zuck?ref=bookmarks")
        == "https://www.facebook.com/zuck"
    )
    # Facebook profile.php
    assert (
        normalize_enrichment_url("facebook", "https://www.facebook.com/profile.php?id=100012345&sk=about")
        == "https://www.facebook.com/profile.php?id=100012345"
    )
    # Non-profile Facebook URLs
    assert normalize_enrichment_url("facebook", "https://www.facebook.com/posts/12345") is None
    assert normalize_enrichment_url("facebook", "https://www.facebook.com/watch/?v=987") is None

    # Instagram profile
    assert (
        normalize_enrichment_url("instagram", "https://www.instagram.com/whoemtalha/?hl=en")
        == "https://www.instagram.com/whoemtalha"
    )
    # Non-profile Instagram URLs
    assert normalize_enrichment_url("instagram", "https://www.instagram.com/reel/C3abcxyz/") is None
    assert normalize_enrichment_url("instagram", "https://www.instagram.com/p/C3abcxyz/") is None
    assert normalize_enrichment_url("instagram", "https://www.instagram.com/explore/tags/nature") is None

@pytest.mark.anyio
async def test_enrich_results_normalizes_linkedin_country_subdomains(monkeypatch):
    calls = []

    async def mock_get(self, url, params=None, **kwargs):
        calls.append(params)
        return httpx.Response(200, json={
            "ok": True,
            "platform": "linkedin",
            "avatar": "https://ai.mihajlo.mk/storage/linkedin/talha.jpg",
        })

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    # Result with country subdomain pk.linkedin.com and tracking param
    r1 = _make_result("1", "linkedin", "https://pk.linkedin.com/in/talha?trk=profile")
    # Result with non-profile article URL (should be filtered out)
    r2 = _make_result("2", "linkedin", "https://www.linkedin.com/pulse/my-thoughts-article")

    enriched = await enrich_results_with_avatars([r1, r2])

    # Only r1 should be queried, with normalized URL
    assert len(calls) == 1
    assert calls[0]["url"] == "https://www.linkedin.com/in/talha"
    assert calls[0]["platform"] == "linkedin"

    # r1 gets avatar
    assert enriched[0].img == "https://ai.mihajlo.mk/storage/linkedin/talha.jpg"
    assert enriched[0].metadata.get("photo_enriched_by") == "identity-resolver"

    # r2 remains without image (initials fallback)
    assert enriched[1].img is None

