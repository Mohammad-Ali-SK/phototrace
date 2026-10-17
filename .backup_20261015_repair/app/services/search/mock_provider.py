import hashlib
from typing import Optional
from .base import BaseSearchProvider, PlatformId, SearchResponse, SearchResult

# Stable mock results corresponding to the frontend demo fixtures
E = 'Exact Image Match'
S = 'Similar Image'
N = 'Name Match'

SAMPLE_ROWS = [
    # platform, user, caption, date, match, confidence, img, source_url
    ('tiktok', '@sarah_diaries', 'Golden hour walk 🌅 #vlog', '2026-09-28', E, 98, '/src/assets/p1.jpg', None),
    ('tiktok', '@city.clips', 'Weekend dance challenge', '2026-09-10', S, 84, '/src/assets/p6.jpg', None),
    ('tiktok', '@travel.with.s', 'Coffee run in Lisbon ☕', '2026-08-15', S, 71, '/src/assets/p9.jpg', None),
    ('instagram', '@sarahofficial', 'Exploring the world ✈️ Travel | Life', '2026-10-02', E, 95, '/src/assets/p2.jpg', None),
    ('instagram', '@s.k.photos', 'Sunset portrait series', '2026-09-20', S, 88, '/src/assets/p5.jpg', None),
    ('instagram', '@wanderlust_sk', 'Beach day, no filter', '2026-08-02', S, 80, '/src/assets/p8.jpg', None),
    ('instagram', '@studio.nine', 'Behind the scenes shoot', '2026-07-14', S, 66, '/src/assets/p4.jpg', None),
    ('facebook', 'Sarah Khan', 'Profile photo update', '2026-09-18', E, 92, '/src/assets/p7.jpg', None),
    ('facebook', 'S. Khan Photography', 'Album: Summer trip', '2026-08-09', S, 78, '/src/assets/p3.jpg', None),
    ('facebook', 'Sarah K.', 'Shared a memory from 2021', '2026-06-30', S, 64, '/src/assets/p2.jpg', None),
    ('linkedin', 'Sarah Khan – Software Engineer', 'Excited to join a new team!', '2026-09-05', E, 88, '/src/assets/p6.jpg', None),
    ('linkedin', 'Sarah K. | Product Design', 'Speaking at DesignConf', '2026-06-12', S, 69, '/src/assets/p8.jpg', None),
]

_MOCK_CACHE: dict[str, SearchResult] = {}

def _init_cache():
    for i, row in enumerate(SAMPLE_ROWS):
        r_id = f"d{i+1}"
        res = SearchResult(
            id=r_id,
            platform=row[0],
            user=row[1],
            caption=row[2],
            matchType=row[4],
            confidence=float(row[5]),
            img=row[6],
            sourceUrl=row[7],
            date=row[3],
            isDemo=True,
            provider="demo",
            metadata={
                "source": "demo_persona",
                "evidence": f"Demonstration entry for persona 'Sarah Khan' on {row[0].capitalize()}.",
                "verified": False,
            }
        )
        _MOCK_CACHE[r_id] = res

_init_cache()

def get_cached_result(result_id: str) -> Optional[SearchResult]:
    return _MOCK_CACHE.get(result_id)

def cache_result(result: SearchResult):
    _MOCK_CACHE[result.id] = result

class MockSearchProvider(BaseSearchProvider):
    def provider_name(self) -> str:
        return "demo"

    def is_configured(self) -> bool:
        return True

    async def search_name(self, query: str, platforms: list[PlatformId]) -> SearchResponse:
        q = query.strip()
        ql = q.lower()

        if ql == 'error':
            raise RuntimeError("Demo error: simulated search failure for testing error handling and retry.")

        if not ql or ql in ('empty', 'john.doe'):
            return SearchResponse(
                query=query,
                searchType='name',
                platforms=platforms,
                provider="demo",
                isDemo=True,
                results=[],
                message="No demo results found for this query."
            )

        # Check if searching for Sarah Khan persona or general tokens
        tokens = [t for t in ql.replace('.', ' ').replace('@', ' ').replace('-', ' ').replace('_', ' ').split() if len(t) >= 2]
        is_sarah = any(t in ('sarah', 'khan', 'sk') for t in tokens) or 'sarah khan' in ql

        if is_sarah:
            matching = []
            for i, row in enumerate(SAMPLE_ROWS):
                plat = row[0]
                if plat in platforms:
                    r_id = f"d{i+1}"
                    res = SearchResult(
                        id=r_id,
                        platform=plat,
                        user=row[1],
                        caption=row[2],
                        matchType=N,
                        confidence=float(row[5]),
                        img=row[6],
                        sourceUrl=row[7],
                        date=row[3],
                        isDemo=True,
                        provider="demo",
                        metadata={
                            "matched_query": query,
                            "evidence": f"Demonstration name match for persona '{query}' on {plat.capitalize()}.",
                            "verified": False,
                        }
                    )
                    cache_result(res)
                    matching.append(res)
            return SearchResponse(
                query=query,
                searchType='name',
                platforms=platforms,
                provider="demo",
                isDemo=True,
                results=matching,
                message=f"Found {len(matching)} demo result(s) for '{query}'."
            )

        if 'travel' in ql:
            matching = []
            for i, row in enumerate(SAMPLE_ROWS):
                plat = row[0]
                if plat in platforms and any(term in (row[1] + ' ' + row[2]).lower() for term in ('travel', 'lisbon', 'trip')):
                    r_id = f"d{i+1}"
                    res = SearchResult(
                        id=r_id,
                        platform=plat,
                        user=row[1],
                        caption=row[2],
                        matchType=N,
                        confidence=float(row[5]),
                        img=row[6],
                        sourceUrl=row[7],
                        date=row[3],
                        isDemo=True,
                        provider="demo",
                        metadata={"matched_query": query, "verified": False}
                    )
                    cache_result(res)
                    matching.append(res)
            return SearchResponse(
                query=query,
                searchType='name',
                platforms=platforms,
                provider="demo",
                isDemo=True,
                results=matching,
                message=f"Found {len(matching)} demo result(s) for '{query}'."
            )

        # For any other user name, check token matches in sample rows or generate query-dependent consistent demo cards
        token_matches = []
        for i, row in enumerate(SAMPLE_ROWS):
            plat = row[0]
            if plat in platforms:
                haystack = f"{row[1]} {row[2]} {row[0]}".lower()
                if any(t in haystack for t in tokens):
                    r_id = f"d{i+1}"
                    res = SearchResult(
                        id=r_id,
                        platform=plat,
                        user=row[1],
                        caption=row[2],
                        matchType=N,
                        confidence=float(row[5]),
                        img=row[6],
                        sourceUrl=row[7],
                        date=row[3],
                        isDemo=True,
                        provider="demo",
                        metadata={"matched_query": query, "verified": False}
                    )
                    cache_result(res)
                    token_matches.append(res)

        if token_matches:
            return SearchResponse(
                query=query,
                searchType='name',
                platforms=platforms,
                provider="demo",
                isDemo=True,
                results=token_matches,
                message=f"Found {len(token_matches)} demo result(s) for '{query}'."
            )

        # If no tokens match, return empty to respect query dependence
        return SearchResponse(
            query=query,
            searchType='name',
            platforms=platforms,
            provider="demo",
            isDemo=True,
            results=[],
            message=f"No matching demo content for '{query}' across selected platforms."
        )

    async def search_photo(self, image_bytes: bytes, filename: str, platforms: list[PlatformId]) -> SearchResponse:
        # Photo search demo
        matching = []
        # Generate a stable hash from the image bytes or filename
        img_hash = hashlib.sha256(image_bytes if image_bytes else filename.encode()).hexdigest()[:8]

        for i, row in enumerate(SAMPLE_ROWS):
            plat = row[0]
            if plat in platforms:
                r_id = f"d{i+1}"
                res = SearchResult(
                    id=r_id,
                    platform=plat,
                    user=row[1],
                    caption=row[2],
                    matchType=row[4],
                    confidence=float(row[5]),
                    img=row[6],
                    sourceUrl=row[7],
                    date=row[3],
                    isDemo=True,
                    provider="demo",
                    metadata={
                        "input_filename": filename,
                        "image_hash": img_hash,
                        "evidence": "Visual feature match on sample demo image.",
                        "verified": False,
                    }
                )
                cache_result(res)
                matching.append(res)

        return SearchResponse(
            query=filename,
            searchType='photo',
            platforms=platforms,
            provider="demo",
            isDemo=True,
            results=matching,
            message=f"Found {len(matching)} illustrative image match result(s) for '{filename}'."
        )
