import io
import pytest
from PIL import Image
from app.services.search import get_search_provider, get_provider_status
from app.services.search.serpapi_provider import SerpApiSearchProvider
from app.services.search.mock_provider import MockSearchProvider
from .test_auth import c, P

def make_test_image(format='JPEG', size=(100, 100), color=(255, 0, 0)) -> bytes:
    buf = io.BytesIO()
    im = Image.new('RGB', size, color=color)
    im.save(buf, format=format)
    return buf.getvalue()

def test_search_providers_status(c):
    r = c.get(P + '/search/providers')
    assert r.status_code == 200
    data = r.json()
    assert 'active_provider' in data
    assert 'providers' in data
    assert 'instructions' in data
    assert data['active_provider'] == 'demo'
    assert data['is_live'] is False

def test_search_name_matching_query(c):
    # Query for "sarah khan" with TikTok deselected -> 9 results
    r = c.post(P + '/search/name', json={
        'query': 'sarah khan',
        'platforms': ['instagram', 'facebook', 'linkedin']
    })
    assert r.status_code == 200
    data = r.json()
    assert data['searchType'] == 'name'
    assert data['isDemo'] is True
    assert len(data['results']) == 9
    for item in data['results']:
        assert item['platform'] in ['instagram', 'facebook', 'linkedin']
        assert item['matchType'] == 'Name Match'

def test_search_name_all_platforms(c):
    # Query for "sarah khan" across all 4 platforms -> 12 results
    r = c.post(P + '/search/name', json={
        'query': 'sarah khan',
        'platforms': ['tiktok', 'instagram', 'facebook', 'linkedin']
    })
    assert r.status_code == 200
    data = r.json()
    assert len(data['results']) == 12

def test_search_name_zero_results(c):
    for empty_q in ['empty', 'john.doe', 'nonexistent_unique_user_xyz']:
        r = c.post(P + '/search/name', json={
            'query': empty_q,
            'platforms': ['instagram', 'tiktok']
        })
        assert r.status_code == 200
        assert r.json()['results'] == []

def test_search_name_validation(c):
    # Empty query
    assert c.post(P + '/search/name', json={'query': '', 'platforms': ['instagram']}).status_code == 422
    # No platforms
    assert c.post(P + '/search/name', json={'query': 'alice', 'platforms': []}).status_code == 422
    # Invalid platform
    assert c.post(P + '/search/name', json={'query': 'alice', 'platforms': ['myspace']}).status_code == 422

def test_search_name_error_simulation(c):
    # Query 'error' triggers simulated provider error
    r = c.post(P + '/search/name', json={
        'query': 'error',
        'platforms': ['instagram']
    })
    assert r.status_code == 503
    assert 'Demo error' in r.json()['detail']

def test_search_photo_uploaded_user_image_returns_empty_in_demo_mode(c):
    img_bytes = make_test_image('JPEG')
    files = {'file': ('Photo.jpeg', img_bytes, 'image/jpeg')}
    data = {'platforms': 'tiktok,instagram'}
    r = c.post(P + '/search/photo', files=files, data=data)
    assert r.status_code == 200
    resp = r.json()
    assert resp['searchType'] == 'photo'
    assert resp['isDemo'] is True
    # In demo mode, arbitrary user uploads return empty results rather than fabricated matches
    assert resp['results'] == []
    assert 'No verified matches found' in resp['message']

def test_search_photo_sample_asset_returns_demo_preview(c):
    img_bytes = make_test_image('JPEG')
    files = {'file': ('sample-sunset-burgundy.jpg', img_bytes, 'image/jpeg')}
    data = {'platforms': 'tiktok,instagram', 'is_sample': 'true'}
    r = c.post(P + '/search/photo', files=files, data=data)
    assert r.status_code == 200
    resp = r.json()
    assert resp['searchType'] == 'photo'
    assert resp['isDemo'] is True
    assert len(resp['results']) > 0
    for res in resp['results']:
        assert res['platform'] in ['tiktok', 'instagram']
        # Must be labeled Demo Preview, never Exact Image Match or Similar Image
        assert res['matchType'] == 'Demo Preview'
        assert res['confidence'] == 0.0


def test_search_photo_unsupported_format(c):
    # GIF is not supported
    gif_bytes = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'
    files = {'file': ('bad.gif', gif_bytes, 'image/gif')}
    data = {'platforms': 'instagram'}
    r = c.post(P + '/search/photo', files=files, data=data)
    assert r.status_code == 400
    assert 'valid JPG, PNG or WEBP' in r.json()['detail']

def test_search_result_details(c):
    # Ensure d1 is accessible via get_result_detail
    r = c.get(P + '/search/results/d1')
    assert r.status_code == 200
    data = r.json()
    assert data['id'] == 'd1'
    assert data['platform'] == 'tiktok'
    assert data['user'] == '@sarah_diaries'

    # Non-existent ID returns 404
    r_bad = c.get(P + '/search/results/unknown_xyz')
    assert r_bad.status_code == 404

def test_provider_selection_auto_with_serpapi_key(monkeypatch, c):
    monkeypatch.setenv('SEARCH_PROVIDER', 'auto')
    monkeypatch.setenv('SERPAPI_API_KEY', 'dummy_serpapi_test_key')
    monkeypatch.delenv('GOOGLE_SEARCH_API_KEY', raising=False)
    monkeypatch.delenv('BING_SEARCH_API_KEY', raising=False)

    provider = get_search_provider()
    assert isinstance(provider, SerpApiSearchProvider)
    assert provider.provider_name() == 'serpapi'
    assert provider.is_configured() is True

    r = c.get(P + '/search/providers')
    assert r.status_code == 200
    data = r.json()
    assert data['active_provider'] == 'serpapi'
    assert data['is_live'] is True
    assert data['providers']['serpapi']['configured'] is True

def test_provider_selection_auto_without_keys(monkeypatch, c):
    monkeypatch.setenv('SEARCH_PROVIDER', 'auto')
    monkeypatch.delenv('SERPAPI_API_KEY', raising=False)
    monkeypatch.delenv('GOOGLE_SEARCH_API_KEY', raising=False)
    monkeypatch.delenv('BING_SEARCH_API_KEY', raising=False)

    provider = get_search_provider()
    assert isinstance(provider, MockSearchProvider)
    assert provider.provider_name() == 'demo'

    r = c.get(P + '/search/providers')
    assert r.status_code == 200
    data = r.json()
    assert data['active_provider'] == 'demo'
    assert data['is_live'] is False
    assert data['providers']['serpapi']['configured'] is False

def test_provider_selection_explicit_serpapi(monkeypatch, c):
    monkeypatch.setenv('SEARCH_PROVIDER', 'serpapi')
    monkeypatch.setenv('SERPAPI_API_KEY', 'dummy_serpapi_test_key')

    provider = get_search_provider()
    assert provider.provider_name() == 'serpapi'

    r = c.get(P + '/search/providers')
    assert r.status_code == 200
    data = r.json()
    assert data['active_provider'] == 'serpapi'
    assert data['is_live'] is True

    # When key is removed, explicit serpapi provider falls back safely to demo
    monkeypatch.delenv('SERPAPI_API_KEY', raising=False)
    provider_fallback = get_search_provider()
    assert provider_fallback.provider_name() == 'demo'

@pytest.mark.anyio
async def test_serpapi_timeout_error_handling(monkeypatch):
    import httpx
    provider = SerpApiSearchProvider(api_key='test_key')

    async def mock_get(*args, **kwargs):
        raise httpx.ReadTimeout("Read operation timed out")

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    with pytest.raises(RuntimeError) as exc_info:
        await provider.search_name("Test User", ["instagram"])
    assert "timed out" in str(exc_info.value).lower()

@pytest.mark.anyio
async def test_serpapi_partial_failure_collects_success(monkeypatch):
    import httpx
    provider = SerpApiSearchProvider(api_key='test_key')

    async def mock_get(self, url, params=None, **kwargs):
        req = httpx.Request("GET", url)
        q = (params or {}).get("q", "")
        if "instagram.com" in q:
            raise httpx.ReadTimeout("Timeout on Instagram")
        # TikTok succeeds
        return httpx.Response(200, json={
            "organic_results": [{
                "title": "Test TikTok - Profile",
                "link": "https://tiktok.com/@testuser",
                "snippet": "Test snippet",
            }]
        }, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = await provider.search_name("Test User", ["tiktok", "instagram"])
    assert len(res.results) == 1
    assert res.results[0].platform == "tiktok"
    assert "instagram" in res.message.lower()

@pytest.mark.anyio
async def test_serpapi_rate_limit_handling(monkeypatch):
    import httpx
    provider = SerpApiSearchProvider(api_key='test_key')

    async def mock_get(self, url, params=None, **kwargs):
        req = httpx.Request("GET", url)
        return httpx.Response(429, json={"error": "Rate limit reached"}, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    with pytest.raises(RuntimeError) as exc_info:
        await provider.search_name("Test User", ["instagram"])
    assert "rate limit" in str(exc_info.value).lower() or "quota" in str(exc_info.value).lower()

def test_extract_serpapi_image_variants():
    from app.services.search.serpapi_provider import extract_serpapi_image

    # 1. Direct thumbnail and image fields
    assert extract_serpapi_image({"thumbnail": "https://serpapi.com/thumb.jpg"}) == "https://serpapi.com/thumb.jpg"
    assert extract_serpapi_image({"image": "https://serpapi.com/image.jpg"}) == "https://serpapi.com/image.jpg"
    assert extract_serpapi_image({"primary_image": "https://serpapi.com/primary.jpg"}) == "https://serpapi.com/primary.jpg"
    assert extract_serpapi_image({"thumbnail": "data:image/jpeg;base64,abc"}) == "data:image/jpeg;base64,abc"
    assert extract_serpapi_image({"thumbnail": "  //cdn.example.com/photo.jpg  "}) == "https://cdn.example.com/photo.jpg"
    assert extract_serpapi_image({"thumbnail": ""}) is None
    assert extract_serpapi_image({"thumbnail": None}) is None

    # 2. Thumbnails array
    assert extract_serpapi_image({"thumbnails": ["https://serpapi.com/thumb_arr.jpg"]}) == "https://serpapi.com/thumb_arr.jpg"
    assert extract_serpapi_image({"thumbnails": [{"src": "https://serpapi.com/thumb_dict.jpg"}]}) == "https://serpapi.com/thumb_dict.jpg"

    # 3. Rich snippet top or bottom thumbnail
    rich_top = {
        "rich_snippet": {
            "top": {
                "thumbnail": "https://encrypted-tbn0.gstatic.com/images?q=tbn:rich"
            }
        }
    }
    assert extract_serpapi_image(rich_top) == "https://encrypted-tbn0.gstatic.com/images?q=tbn:rich"

    rich_bottom = {
        "rich_snippet": {
            "bottom": {
                "thumbnails": [{"url": "https://encrypted-tbn0.gstatic.com/images?q=tbn:bottom"}]
            }
        }
    }
    assert extract_serpapi_image(rich_bottom) == "https://encrypted-tbn0.gstatic.com/images?q=tbn:bottom"

    # 4. Inline images and images array
    assert extract_serpapi_image({"inline_images": [{"thumbnail": "https://inline.example.com/1.png"}]}) == "https://inline.example.com/1.png"
    assert extract_serpapi_image({"images": ["https://images.example.com/first.jpg"]}) == "https://images.example.com/first.jpg"

    # 5. Pagemap metadata
    pagemap_thumb = {
        "pagemap": {
            "cse_thumbnail": [{"src": "https://encrypted-tbn0.gstatic.com/images?q=tbn:cse_thumb"}]
        }
    }
    assert extract_serpapi_image(pagemap_thumb) == "https://encrypted-tbn0.gstatic.com/images?q=tbn:cse_thumb"

    pagemap_img = {
        "pagemap": {
            "cse_image": [{"src": "https://images.example.com/profile.jpg"}]
        }
    }
    assert extract_serpapi_image(pagemap_img) == "https://images.example.com/profile.jpg"

    pagemap_meta = {
        "pagemap": {
            "metatags": [{"og:image": "https://og.example.com/banner.jpg"}]
        }
    }
    assert extract_serpapi_image(pagemap_meta) == "https://og.example.com/banner.jpg"

    pagemap_hcard = {
        "pagemap": {
            "hcard": [{"photo": "https://hcard.example.com/avatar.jpg"}]
        }
    }
    assert extract_serpapi_image(pagemap_hcard) == "https://hcard.example.com/avatar.jpg"

    # 6. Empty or irrelevant fields (no thumbnail)
    assert extract_serpapi_image({}) is None
    assert extract_serpapi_image({"favicon": "https://instagram.com/favicon.ico"}) is None
    assert extract_serpapi_image({"thumbnail": "javascript:alert(1)"}) is None

@pytest.mark.anyio
async def test_serpapi_image_mapping_per_result(monkeypatch):
    import httpx
    provider = SerpApiSearchProvider(api_key='test_key')

    async def mock_get(self, url, params=None, **kwargs):
        req = httpx.Request("GET", url)
        return httpx.Response(200, json={
            "organic_results": [
                {
                    "title": "User One - TikTok",
                    "link": "https://tiktok.com/@userone",
                    "snippet": "User one snippet",
                    "thumbnail": "https://tiktok.com/thumb1.jpg"
                },
                {
                    "title": "User Two - TikTok",
                    "link": "https://tiktok.com/@usertwo",
                    "snippet": "User two snippet"
                    # No thumbnail
                }
            ]
        }, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = await provider.search_name("User", ["tiktok"])
    assert len(res.results) == 2
    # Result 1 has its own thumbnail
    assert res.results[0].img == "https://tiktok.com/thumb1.jpg"
    # Result 2 has None and does not steal Result 1's thumbnail
    assert res.results[1].img is None




