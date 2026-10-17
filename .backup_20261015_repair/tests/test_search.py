import io
from PIL import Image
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

def test_search_photo_success(c):
    img_bytes = make_test_image('JPEG')
    files = {'file': ('test.jpg', img_bytes, 'image/jpeg')}
    data = {'platforms': 'tiktok,instagram'}
    r = c.post(P + '/search/photo', files=files, data=data)
    assert r.status_code == 200
    resp = r.json()
    assert resp['searchType'] == 'photo'
    assert resp['isDemo'] is True
    assert len(resp['results']) > 0
    for res in resp['results']:
        assert res['platform'] in ['tiktok', 'instagram']

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
