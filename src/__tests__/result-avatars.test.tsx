import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { setContext, clearExecution } from '../services/searchSession';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearExecution();
  window.scrollTo = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"no"}', { status: 401 })));
});

afterEach(() => {
  cleanup();
  clearExecution();
  vi.unstubAllGlobals();
});

describe('Live Search Results - Genuine Profile Photo & Thumbnail Handling', () => {
  it('displays genuine provider thumbnail when available and never uses demo fixtures for live results', async () => {
    const mockApiResponse = {
      query: 'John Doe',
      searchType: 'name',
      platforms: ['instagram', 'tiktok'],
      provider: 'serpapi',
      isDemo: false,
      results: [
        {
          id: 'res-live-1',
          platform: 'instagram',
          user: 'John Doe (@johndoe)',
          caption: 'John Doe official Instagram profile',
          date: '2026-01-15',
          matchType: 'Exact Image Match', // should not map to demo preview if isDemo is false
          confidence: 0,
          img: 'https://images.example.com/johndoe-avatar.jpg',
          sourceUrl: 'https://www.instagram.com/johndoe',
          isDemo: false,
          provider: 'serpapi',
        },
        {
          id: 'res-live-2',
          platform: 'tiktok',
          user: 'John Doe Official',
          caption: 'TikTok creator profile',
          date: '2026-02-10',
          matchType: 'Name Match',
          confidence: 0,
          img: null, // No thumbnail provided by search provider
          sourceUrl: 'https://www.tiktok.com/@johndoe',
          isDemo: false,
          provider: 'serpapi',
        },
      ],
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{"detail":"no"}', { status: 404 });
    }));

    setContext({
      id: 'test-live-images',
      type: 'name',
      query: 'John Doe',
      platforms: ['instagram', 'tiktok'],
      isDemo: false,
      provider: 'serpapi',
    });

    window.location.hash = '#/results';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();
    expect(await screen.findByText('Public web results')).toBeTruthy();

    // 1. Result 1 renders its genuine provider thumbnail
    const img1 = (await screen.findByAltText('Profile preview for John Doe (@johndoe)')) as HTMLImageElement;
    expect(img1).toBeTruthy();
    expect(img1.src).toBe('https://images.example.com/johndoe-avatar.jpg');

    // 2. Result 2 has no image -> strictly renders platform-styled initials fallback
    const tiktokFallback = await screen.findByTestId('avatar-fallback-tiktok');
    expect(tiktokFallback).toBeTruthy();
    expect(tiktokFallback.textContent).toContain('JD');
    expect(tiktokFallback.textContent).toContain('Public TikTok source');

    // 3. Result 2 NEVER inherits Result 1's image or any demo image
    const renderedImages = screen.getAllByRole('img');
    for (const img of renderedImages) {
      const src = (img as HTMLImageElement).src;
      // Never use demo assets
      expect(src).not.toMatch(/p\d+\.jpg$/);
    }
    // Only Result 1 has an image rendered
    const profilePreviews = screen.getAllByRole('img').filter(img =>
      (img as HTMLImageElement).alt.includes('Profile preview')
    );
    expect(profilePreviews.length).toBe(1);
  });

  it('transitions to platform-styled initials fallback when an image fails to load (onError)', async () => {
    const mockApiResponse = {
      query: 'Broken Image User',
      searchType: 'name',
      platforms: ['facebook'],
      provider: 'serpapi',
      isDemo: false,
      results: [
        {
          id: 'res-broken-1',
          platform: 'facebook',
          user: 'Broken Image User',
          caption: 'Facebook public page',
          date: '2026-03-01',
          matchType: 'Name Match',
          confidence: 0,
          img: 'https://broken.example.com/missing-404.jpg',
          sourceUrl: 'https://www.facebook.com/brokenuser',
          isDemo: false,
          provider: 'serpapi',
        },
      ],
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{"detail":"no"}', { status: 404 });
    }));

    setContext({
      id: 'test-broken-image',
      type: 'name',
      query: 'Broken Image User',
      platforms: ['facebook'],
      isDemo: false,
      provider: 'serpapi',
    });

    window.location.hash = '#/results';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();

    const img = (await screen.findByAltText('Profile preview for Broken Image User')) as HTMLImageElement;
    expect(img).toBeTruthy();

    // Trigger image load failure
    fireEvent.error(img);

    // Fallback initials avatar should now be visible
    const fbFallback = await screen.findByTestId('avatar-fallback-facebook');
    expect(fbFallback).toBeTruthy();
    expect(fbFallback.textContent).toContain('BI');
    expect(fbFallback.textContent).toContain('Public Facebook source');
  });

  it('preserves genuine image on DetailsPage and handles image load error gracefully', async () => {
    const liveItem = {
      id: 'res-details-live',
      platform: 'linkedin',
      user: 'Talha Professional',
      caption: 'Talha on LinkedIn',
      date: '2026-02-20',
      matchType: 'Name Match',
      confidence: 0,
      img: 'https://images.example.com/talha-linkedin.jpg',
      sourceUrl: 'https://www.linkedin.com/in/talha-prof',
      isDemo: false,
      provider: 'serpapi',
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify({
          query: 'Talha Professional',
          searchType: 'name',
          platforms: ['linkedin'],
          provider: 'serpapi',
          isDemo: false,
          results: [liveItem],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/v1/search/results/res-details-live')) {
        return new Response(JSON.stringify(liveItem), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{"detail":"no"}', { status: 404 });
    }));

    setContext({
      id: 'test-details-img',
      type: 'name',
      query: 'Talha Professional',
      platforms: ['linkedin'],
      isDemo: false,
      provider: 'serpapi',
    });

    window.location.hash = '#/results';
    render(<App />);

    // Click View Details
    const viewDetails = await screen.findByRole('link', { name: /View Details/i });
    fireEvent.click(viewDetails);

    // Verify Details Page loaded
    expect(await screen.findByRole('heading', { name: 'Match Details' })).toBeTruthy();
    expect(await screen.findByText('Verified Public Result')).toBeTruthy();

    // Genuine image is preserved on Details Page
    const detailsImg = (await screen.findByAltText('Profile preview for Talha Professional')) as HTMLImageElement;
    expect(detailsImg).toBeTruthy();
    expect(detailsImg.src).toBe('https://images.example.com/talha-linkedin.jpg');

    // Simulate error on details page image
    fireEvent.error(detailsImg);

    // Details fallback initials avatar is rendered
    const detailsFallback = await screen.findByTestId('details-fallback-linkedin');
    expect(detailsFallback).toBeTruthy();
    expect(detailsFallback.textContent).toContain('TP');
    expect(detailsFallback.textContent).toContain('No direct thumbnail indexed');
  });

  it('renders initials such as SS when SerpApi does not provide an image for a public profile (e.g. Sam Smith)', async () => {
    // Real-world scenario: SerpApi Google search for "Sam Smith" site:instagram.com returns profile with no thumbnail
    const mockApiResponse = {
      query: 'Sam Smith',
      searchType: 'name',
      platforms: ['instagram'],
      provider: 'serpapi',
      isDemo: false,
      results: [
        {
          id: 's_instagram_samsmith',
          platform: 'instagram',
          user: 'Sam Smith (@samsmith)',
          caption: '(@samsmith) • Instagram photos and videos',
          date: null,
          matchType: 'Name Match',
          confidence: 0,
          img: null, // Verified: SerpApi Google organic result has no thumbnail for this profile
          sourceUrl: 'https://www.instagram.com/samsmith/',
          isDemo: false,
          provider: 'serpapi',
        },
      ],
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{"detail":"no"}', { status: 404 });
    }));

    setContext({
      id: 'test-samsmith-initials',
      type: 'name',
      query: 'Sam Smith',
      platforms: ['instagram'],
      isDemo: false,
      provider: 'serpapi',
    });

    window.location.hash = '#/results';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();

    // Initials fallback renders "SS" for "Sam Smith"
    const fallback = await screen.findByTestId('avatar-fallback-instagram');
    expect(fallback).toBeTruthy();
    expect(fallback.textContent).toContain('SS');
    expect(fallback.textContent).toContain('Sam Smith (@samsmith)');
    expect(fallback.textContent).toContain('Public Instagram source');

    // Never renders demo image
    const imgs = screen.queryAllByRole('img');
    for (const img of imgs) {
      expect((img as HTMLImageElement).src).not.toMatch(/p\d+\.jpg$/);
    }
  });
});
