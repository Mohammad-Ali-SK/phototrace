import io
import pytest
import httpx
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.services.search.serpapi_provider import (
    SerpApiSearchProvider,
    _prepare_image_for_serpapi,
)

def _make_dummy_image(size=(100, 100), color=(0, 255, 0), format="JPEG") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=color).save(buf, format=format)
    return buf.getvalue()


@pytest.mark.anyio
async def test_serpapi_photo_search_success(monkeypatch):
    provider = SerpApiSearchProvider(api_key="secret_test_key_123")
    img_bytes = _make_dummy_image()

    calls = {"upload": 0, "lens": 0, "enricher": 0}

    async def mock_post(self, url, files=None, data=None, **kwargs):
        calls["upload"] += 1
        assert "serpapi.com/image" in url
        assert data.get("api_key") == "secret_test_key_123"
        return httpx.Response(200, json={
            "message": "Image uploaded successfully.",
            "image_id": "test_lens_image_id_456"
        })

    async def mock_get(self, url, params=None, **kwargs):
        if "serpapi.com/search" in url:
            calls["lens"] += 1
            assert params.get("engine") == "google_lens"
            assert params.get("image_id") == "test_lens_image_id_456"
            assert params.get("api_key") == "secret_test_key_123"
            return httpx.Response(200, json={
                "visual_matches": [
                    {
                        "title": "Jane Doe (@janedoe) • Instagram",
                        "link": "https://www.instagram.com/janedoe/",
                        "source": "Instagram",
                        "thumbnail": "https://encrypted-tbn0.gstatic.com/thumb_ig.jpg",
                        "position": 1
                    },
                    {
                        "title": "Jane Doe - Senior Engineer | LinkedIn",
                        "link": "https://www.linkedin.com/in/janedoe",
                        "source": "LinkedIn",
                        "position": 2
                    },
                    {
                        "title": "Unrelated Product Match",
                        "link": "https://www.amazon.com/dp/B00000",
                        "source": "Amazon",
                        "thumbnail": "https://amazon.com/thumb.jpg",
                        "position": 3
                    }
                ],
                "exact_matches": []
            })
        elif "identity-resolver" in url:
            calls["enricher"] += 1
            return httpx.Response(200, json={
                "ok": True,
                "avatar": "https://ai.mihajlo.mk/storage/linkedin/janedoe.jpg"
            })
        return httpx.Response(404)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = await provider.search_photo(img_bytes, "test_face.jpg", ["instagram", "linkedin"])

    assert calls["upload"] == 1
    assert calls["lens"] == 1
    assert calls["enricher"] == 1
    assert res.search_type == "photo"
    assert res.is_demo is False
    assert res.provider == "serpapi"
    assert len(res.results) == 2

    # Instagram match: preserves genuine Google Lens thumbnail, NOT replaced by resolver
    ig = res.results[0]
    assert ig.platform == "instagram"
    assert ig.source_url == "https://www.instagram.com/janedoe/"
    assert ig.img == "https://encrypted-tbn0.gstatic.com/thumb_ig.jpg"
    assert ig.confidence == 0.0
    assert ig.is_demo is False
    assert ig.match_type == "Similar Image"

    # LinkedIn match: had no Google Lens thumbnail, was enriched by Identity Resolver
    li = res.results[1]
    assert li.platform == "linkedin"
    assert li.source_url == "https://www.linkedin.com/in/janedoe"
    assert li.img == "https://ai.mihajlo.mk/storage/linkedin/janedoe.jpg"
    assert li.metadata.get("photo_enriched_by") == "identity-resolver"
    assert li.confidence == 0.0


@pytest.mark.anyio
async def test_serpapi_photo_search_empty_filtered_matches(monkeypatch):
    provider = SerpApiSearchProvider(api_key="secret_test_key_123")
    img_bytes = _make_dummy_image()

    async def mock_post(self, url, files=None, data=None, **kwargs):
        return httpx.Response(200, json={"image_id": "img_empty_123"})

    async def mock_get(self, url, params=None, **kwargs):
        return httpx.Response(200, json={
            "visual_matches": [
                {
                    "title": "Random Store Product",
                    "link": "https://www.target.com/p/item",
                    "source": "Target",
                }
            ]
        })

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = await provider.search_photo(img_bytes, "photo.jpg", ["instagram", "tiktok"])
    assert res.search_type == "photo"
    assert res.is_demo is False
    assert len(res.results) == 0
    assert "No matching public results" in (res.message or "")


@pytest.mark.anyio
async def test_serpapi_photo_search_upload_error(monkeypatch):
    provider = SerpApiSearchProvider(api_key="secret_test_key_123")
    img_bytes = _make_dummy_image()

    async def mock_post(self, url, files=None, data=None, **kwargs):
        return httpx.Response(400, json={"error": "Corrupt or unsupported image stream"})

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(RuntimeError) as exc_info:
        await provider.search_photo(img_bytes, "corrupt.jpg", ["facebook"])

    err_str = str(exc_info.value)
    assert "Corrupt or unsupported image stream" in err_str
    # Ensure secret API key is never leaked in error
    assert "secret_test_key_123" not in err_str


@pytest.mark.anyio
async def test_serpapi_photo_search_rate_limited(monkeypatch):
    provider = SerpApiSearchProvider(api_key="secret_test_key_123")
    img_bytes = _make_dummy_image()

    async def mock_post(self, url, files=None, data=None, **kwargs):
        return httpx.Response(429, json={"error": "Rate limit exceeded"})

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(RuntimeError) as exc_info:
        await provider.search_photo(img_bytes, "photo.jpg", ["facebook"])

    assert "quota exceeded or rate limited" in str(exc_info.value).lower()


@pytest.mark.anyio
async def test_serpapi_photo_search_timeout(monkeypatch):
    provider = SerpApiSearchProvider(api_key="secret_test_key_123")
    img_bytes = _make_dummy_image()

    async def mock_post(self, url, files=None, data=None, **kwargs):
        raise httpx.ReadTimeout("Request timed out during image upload")

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(RuntimeError) as exc_info:
        await provider.search_photo(img_bytes, "photo.jpg", ["facebook"])

    assert "timed out" in str(exc_info.value).lower()


def test_prepare_image_compresses_large_payload():
    # Create an image that exceeds 500 KB
    buf = io.BytesIO()
    large_im = Image.new("RGB", (1800, 1800), color=(128, 64, 200))
    large_im.save(buf, format="PNG")
    raw_bytes = buf.getvalue()

    prepared_bytes, mime = _prepare_image_for_serpapi(raw_bytes, max_bytes=480 * 1024)
    assert len(prepared_bytes) <= 490 * 1024
    assert mime in ("image/jpeg", "image/png", "image/webp")


def test_api_endpoint_photo_search(monkeypatch):
    client = TestClient(app)
    img_bytes = _make_dummy_image()

    async def mock_post(self, url, files=None, data=None, **kwargs):
        return httpx.Response(200, json={"image_id": "ep_test_img"})

    async def mock_get(self, url, params=None, **kwargs):
        return httpx.Response(200, json={
            "visual_matches": [
                {
                    "title": "Profile on Facebook",
                    "link": "https://www.facebook.com/publicuser",
                    "source": "Facebook",
                    "thumbnail": "https://fb.com/thumb.jpg",
                }
            ]
        })

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    # Force SerpApi provider
    from app.services.search.factory import get_search_provider
    monkeypatch.setattr(
        "app.main.get_search_provider",
        lambda: SerpApiSearchProvider(api_key="test_api_key")
    )

    resp = client.post(
        "/api/v1/search/photo",
        files={"file": ("my_upload.jpg", img_bytes, "image/jpeg")},
        data={"platforms": "facebook,instagram", "is_sample": "false"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["searchType"] == "photo"
    assert data["isDemo"] is False
    assert data["provider"] == "serpapi"
    assert len(data["results"]) == 1
    assert data["results"][0]["platform"] == "facebook"
    assert data["results"][0]["sourceUrl"] == "https://www.facebook.com/publicuser"
    assert data["results"][0]["img"] == "https://fb.com/thumb.jpg"


@pytest.mark.anyio
async def test_serpapi_photo_search_distinguishes_exact_and_visual_matches(monkeypatch):
    provider = SerpApiSearchProvider(api_key="secret_test_key_123")
    img_bytes = _make_dummy_image()

    async def mock_post(self, url, files=None, data=None, **kwargs):
        return httpx.Response(200, json={"image_id": "test_lens_exact_and_visual"})

    async def mock_get(self, url, params=None, **kwargs):
        if "serpapi.com/search" in url:
            return httpx.Response(200, json={
                "exact_matches": [
                    {
                        "title": "Exact Duplicate Profile | Instagram",
                        "link": "https://www.instagram.com/exact_user/",
                        "source": "Instagram",
                        "thumbnail": "https://encrypted-tbn0.gstatic.com/exact_thumb.jpg",
                        "position": 1,
                    }
                ],
                "visual_matches": [
                    {
                        "title": "Visually Similar Lookalike | Facebook",
                        "link": "https://www.facebook.com/lookalike_user",
                        "source": "Facebook",
                        "thumbnail": "https://encrypted-tbn0.gstatic.com/lookalike_thumb.jpg",
                        "position": 2,
                    }
                ]
            })
        return httpx.Response(404)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = await provider.search_photo(img_bytes, "reference.jpg", ["instagram", "facebook"])

    assert res.search_type == "photo"
    assert res.is_demo is False
    assert len(res.results) == 2

    # Result 0 is Exact Image Match
    exact_res = res.results[0]
    assert exact_res.platform == "instagram"
    assert exact_res.match_type == "Exact Image Match"
    assert exact_res.confidence == 0.0
    assert exact_res.source_url == "https://www.instagram.com/exact_user/"

    # Result 1 is Similar Image (visual resemblance)
    similar_res = res.results[1]
    assert similar_res.platform == "facebook"
    assert similar_res.match_type == "Similar Image"
    assert similar_res.confidence == 0.0
    assert similar_res.source_url == "https://www.facebook.com/lookalike_user"


@pytest.mark.parametrize("orientation,expected_aspect", [
    (1, "landscape"),  # normal
    (3, "landscape"),  # 180 deg rotation -> still landscape
    (6, "portrait"),   # 90 deg CW -> transposes landscape (2000x1000) to portrait (height > width)
    (8, "portrait"),   # 270 deg CW -> transposes landscape (2000x1000) to portrait (height > width)
])
def test_prepare_image_exif_orientations(orientation, expected_aspect):
    # Create a 2000x1000 landscape image with raw size > 500 KB to trigger compression & transposition
    im = Image.new("RGB", (2000, 1000), color=(100, 150, 200))
    exif = im.getexif()
    exif[0x0112] = orientation  # Tag 274: Orientation

    buf = io.BytesIO()
    im.save(buf, format="JPEG", exif=exif, quality=95)
    raw_bytes = buf.getvalue()

    # Ensure raw bytes exceed max_bytes to execute transpose & compression path
    prepared_bytes, mime = _prepare_image_for_serpapi(raw_bytes, max_bytes=300 * 1024)
    assert len(prepared_bytes) <= 300 * 1024
    assert mime == "image/jpeg"

    # Verify the processed image is upright with correct orientation transposed
    with Image.open(io.BytesIO(prepared_bytes)) as out_img:
        w, h = out_img.size
        if expected_aspect == "portrait":
            assert h > w, f"Expected portrait (height > width) for orientation {orientation}, got {w}x{h}"
        else:
            assert w > h, f"Expected landscape (width > height) for orientation {orientation}, got {w}x{h}"


def test_prepare_image_without_exif():
    # Verify image without EXIF orientation processes safely without errors
    im = Image.new("RGB", (1600, 1200), color=(50, 100, 150))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=95)
    raw_bytes = buf.getvalue()

    prepared_bytes, mime = _prepare_image_for_serpapi(raw_bytes, max_bytes=250 * 1024)
    assert len(prepared_bytes) <= 250 * 1024
    with Image.open(io.BytesIO(prepared_bytes)) as out_img:
        w, h = out_img.size
        assert w > h


@pytest.mark.anyio
async def test_serpapi_photo_search_with_name_combined(monkeypatch):
    provider = SerpApiSearchProvider(api_key="secret_test_key_123")
    img_bytes = _make_dummy_image()

    calls = {"post": 0, "lens": 0, "name_search": 0}

    async def mock_post(self, url, files=None, data=None, **kwargs):
        calls["post"] += 1
        return httpx.Response(200, json={"image_id": "lens_combined_123"})

    async def mock_get(self, url, params=None, **kwargs):
        params = params or {}
        req = httpx.Request("GET", url)
        if params.get("engine") == "google_lens":
            calls["lens"] += 1
            return httpx.Response(200, json={
                "exact_matches": [
                    {
                        "title": "Alice Smith - Verified Profile",
                        "link": "https://www.linkedin.com/in/alicesmith",
                        "source": "LinkedIn",
                        "thumbnail": "https://linkedin.com/alice_exact.jpg",
                    }
                ],
                "visual_matches": [
                    {
                        "title": "Aesthetic Lookalike Portrait",
                        "link": "https://www.instagram.com/p/lookalike1",
                        "source": "Instagram",
                        "thumbnail": "https://instagram.com/lookalike1.jpg",
                    }
                ]
            }, request=req)
        elif params.get("engine") == "google":
            calls["name_search"] += 1
            # Mock organic Google search for "Alice Smith"
            return httpx.Response(200, json={
                "organic_results": [
                    # 1 duplicate URL that also exists in lens results
                    {
                        "title": "Alice Smith | LinkedIn",
                        "link": "https://www.linkedin.com/in/alicesmith",
                        "snippet": "Alice Smith executive profile",
                    },
                    # 1 unique name-related result on Facebook
                    {
                        "title": "Alice Smith Public Page",
                        "link": "https://www.facebook.com/alicesmith.official",
                        "snippet": "Official Facebook public page",
                    }
                ]
            }, request=req)
        elif "identity-resolver" in url:
            return httpx.Response(200, json={"ok": False}, request=req)
        return httpx.Response(404, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = await provider.search_photo(
        img_bytes,
        "alice.jpg",
        ["linkedin", "instagram", "facebook"],
        name="Alice Smith",
    )

    assert res.search_type == "photo"
    assert res.is_demo is False
    assert res.query == "alice.jpg + Alice Smith"

    # Total 3 results:
    # 1. Exact Image Match (LinkedIn) - deduplicated with name result, annotated with name match
    # 2. Similar Image (Instagram)
    # 3. Name Match (Facebook)
    assert len(res.results) == 3

    exact_res = [r for r in res.results if r.match_type == "Exact Image Match"]
    similar_res = [r for r in res.results if r.match_type == "Similar Image"]
    name_res = [r for r in res.results if r.match_type == "Name Match"]

    assert len(exact_res) == 1
    assert exact_res[0].source_url == "https://www.linkedin.com/in/alicesmith"
    assert exact_res[0].metadata.get("has_name_match") is True
    assert exact_res[0].confidence == 0.0

    assert len(similar_res) == 1
    assert similar_res[0].source_url == "https://www.instagram.com/p/lookalike1"
    assert similar_res[0].confidence == 0.0

    assert len(name_res) == 1
    assert name_res[0].source_url == "https://www.facebook.com/alicesmith.official"
    assert name_res[0].confidence == 0.0

    # Ensure ranking prioritized the result with both image and name evidence first
    assert res.results[0].source_url == "https://www.linkedin.com/in/alicesmith"


@pytest.mark.anyio
async def test_serpapi_photo_search_without_name_or_whitespace_name(monkeypatch):
    provider = SerpApiSearchProvider(api_key="secret_test_key_123")
    img_bytes = _make_dummy_image()

    calls = {"post": 0, "lens": 0, "name_search": 0}

    async def mock_post(self, url, files=None, data=None, **kwargs):
        calls["post"] += 1
        return httpx.Response(200, json={"image_id": "lens_img_789"})

    async def mock_get(self, url, params=None, **kwargs):
        params = params or {}
        if params.get("engine") == "google_lens":
            calls["lens"] += 1
            return httpx.Response(200, json={
                "visual_matches": [
                    {
                        "title": "Lookalike Only",
                        "link": "https://www.instagram.com/lookalike_only",
                        "source": "Instagram",
                    }
                ]
            })
        elif params.get("engine") == "google":
            calls["name_search"] += 1
            return httpx.Response(200, json={"organic_results": []})
        return httpx.Response(404)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    # Test 1: name=None
    res1 = await provider.search_photo(img_bytes, "test.jpg", ["instagram"], name=None)
    assert res1.query == "test.jpg"
    assert len(res1.results) == 1
    assert calls["name_search"] == 0

    # Test 2: name="   " (whitespace-only)
    res2 = await provider.search_photo(img_bytes, "test.jpg", ["instagram"], name="   \t\n")
    assert res2.query == "test.jpg"
    assert len(res2.results) == 1
    assert calls["name_search"] == 0


def test_api_endpoint_photo_search_with_name(monkeypatch):
    client = TestClient(app)
    img_bytes = _make_dummy_image()

    async def mock_post(self, url, files=None, data=None, **kwargs):
        return httpx.Response(200, json={"image_id": "ep_test_img"})

    async def mock_get(self, url, params=None, **kwargs):
        params = params or {}
        req = httpx.Request("GET", url)
        if params.get("engine") == "google_lens":
            return httpx.Response(200, json={
                "visual_matches": [
                    {
                        "title": "Photo Lookalike",
                        "link": "https://www.facebook.com/publicuser",
                        "source": "Facebook",
                        "thumbnail": "https://fb.com/thumb.jpg",
                    }
                ]
            }, request=req)
        elif params.get("engine") == "google":
            return httpx.Response(200, json={
                "organic_results": [
                    {
                        "title": "John Doe - Facebook Profile",
                        "link": "https://www.facebook.com/johndoe",
                        "snippet": "Public profile of John Doe",
                    }
                ]
            }, request=req)
        elif "identity-resolver" in url:
            return httpx.Response(200, json={"ok": False}, request=req)
        return httpx.Response(404, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    monkeypatch.setattr(
        "app.main.get_search_provider",
        lambda: SerpApiSearchProvider(api_key="test_api_key")
    )

    resp = client.post(
        "/api/v1/search/photo",
        files={"file": ("profile.jpg", img_bytes, "image/jpeg")},
        data={"platforms": "facebook", "name": "John Doe", "is_sample": "false"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["searchType"] == "photo"
    assert data["query"] == "profile.jpg + John Doe"
    assert len(data["results"]) == 2
    match_types = [r["matchType"] for r in data["results"]]
    assert "Similar Image" in match_types
    assert "Name Match" in match_types



