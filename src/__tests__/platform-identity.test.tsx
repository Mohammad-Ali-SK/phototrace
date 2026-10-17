import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import {
  normalizePlatformFromUrl,
  resolveResultPlatform,
  deduplicateResults,
} from '../services/platformHelper';
import { setContext, clearExecution } from '../services/searchSession';
import type { DemoResult } from '../services/resultsService';

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

describe('Platform Identity & Count Normalization', () => {
  describe('normalizePlatformFromUrl', () => {
    it('accurately resolves Instagram URLs with various subdomains and paths', () => {
      expect(normalizePlatformFromUrl('https://www.instagram.com/whoemtalha')).toBe('instagram');
      expect(normalizePlatformFromUrl('http://instagram.com/p/12345/')).toBe('instagram');
      expect(normalizePlatformFromUrl('https://m.instagram.com/explore')).toBe('instagram');
    });

    it('accurately resolves Facebook URLs', () => {
      expect(normalizePlatformFromUrl('https://www.facebook.com/zuck')).toBe('facebook');
      expect(normalizePlatformFromUrl('https://fb.com/page')).toBe('facebook');
      expect(normalizePlatformFromUrl('https://m.facebook.com/profile.php?id=123')).toBe('facebook');
    });

    it('accurately resolves TikTok URLs', () => {
      expect(normalizePlatformFromUrl('https://www.tiktok.com/@tiktokuser')).toBe('tiktok');
      expect(normalizePlatformFromUrl('https://tiktok.com/@creator/video/123')).toBe('tiktok');
    });

    it('accurately resolves LinkedIn URLs', () => {
      expect(normalizePlatformFromUrl('https://www.linkedin.com/in/talha')).toBe('linkedin');
      expect(normalizePlatformFromUrl('https://pk.linkedin.com/pub/dir/talha')).toBe('linkedin');
    });

    it('classifies unknown, general web, or invalid URLs as "other"', () => {
      expect(normalizePlatformFromUrl('https://randomblog.com/whoemtalha')).toBe('other');
      expect(normalizePlatformFromUrl('https://google.com/search?q=test')).toBe('other');
      expect(normalizePlatformFromUrl('https://example.org/profile')).toBe('other');
      expect(normalizePlatformFromUrl('')).toBe('other');
      expect(normalizePlatformFromUrl(null)).toBe('other');
      expect(normalizePlatformFromUrl(undefined)).toBe('other');
      expect(normalizePlatformFromUrl('not-a-valid-url')).toBe('other');
    });
  });

  describe('resolveResultPlatform', () => {
    it('Requirement 1: prefers verified sourceUrl over misleading provider platform or title', () => {
      // Misleading declared platform was linkedin, but sourceUrl is instagram.com
      const resolved = resolveResultPlatform({
        platform: 'linkedin',
        sourceUrl: 'https://www.instagram.com/whoemtalha',
        isDemo: false,
      });
      expect(resolved).toBe('instagram');
    });

    it('Requirement 2: resolves LinkedIn URL to linkedin even when username or caption looks like Instagram', () => {
      const resolved = resolveResultPlatform({
        platform: 'instagram',
        sourceUrl: 'https://www.linkedin.com/in/insta-celebrity',
        isDemo: false,
      });
      expect(resolved).toBe('linkedin');
    });

    it('Requirement 7: classifies unknown source URLs as "other" and never assigns them to known platform', () => {
      const resolved = resolveResultPlatform({
        platform: 'facebook',
        sourceUrl: 'https://blog.personal.net/articles/whoemtalha',
        isDemo: false,
      });
      expect(resolved).toBe('other');
    });

    it('Requirement 8: preserves declared platform for demo fixtures with no sourceUrl', () => {
      const resolved = resolveResultPlatform({
        platform: 'tiktok',
        sourceUrl: null,
        isDemo: true,
      });
      expect(resolved).toBe('tiktok');
    });
  });

  describe('deduplicateResults', () => {
    it('Requirement 4 & 5: deduplicates identical source URLs (case-insensitive & trailing slash stripped)', () => {
      const raw = [
        { id: '1', sourceUrl: 'https://www.instagram.com/whoemtalha/', user: 'Talha' },
        { id: '2', sourceUrl: 'https://www.INSTAGRAM.com/whoemtalha', user: 'Talha Duplicate' },
        { id: '3', sourceUrl: 'https://www.instagram.com/whoemtalha', user: 'Talha Duplicate 2' },
        { id: '4', sourceUrl: 'https://www.facebook.com/whoemtalha', user: 'Talha FB' },
      ];
      const deduped = deduplicateResults(raw);
      expect(deduped.length).toBe(2);
      expect(deduped[0].id).toBe('1');
      expect(deduped[1].id).toBe('4');
    });

    it('deduplicates items without sourceUrl by ID', () => {
      const raw = [
        { id: 'demo-1', user: 'Sarah Khan' },
        { id: 'demo-1', user: 'Sarah Khan Duplicate' },
        { id: 'demo-2', user: 'Sarah Khan 2' },
      ];
      const deduped = deduplicateResults(raw);
      expect(deduped.length).toBe(2);
      expect(deduped[0].id).toBe('demo-1');
      expect(deduped[1].id).toBe('demo-2');
    });
  });

  describe('Results Page End-to-End Platform Identity & Counts', () => {
    it('correctly handles the whoemtalha bug: duplicates removed, platform verified as Instagram, counts consistent', async () => {
      // Mock API returning 10 raw results from SerpApi during a linkedin loop, but all point to Instagram
      const mockApiResponse = {
        results: Array.from({ length: 10 }, (_, i) => ({
          id: `res-${i}`,
          platform: 'linkedin', // buggy raw provider assignment
          user: 'whoemtalha',
          caption: 'Talha • Instagram photos and videos',
          date: '2026-03-01',
          matchType: 'Name Match',
          confidence: 0,
          img: '',
          sourceUrl: 'https://www.instagram.com/whoemtalha',
          isDemo: false,
          provider: 'serpapi',
        })),
        isDemo: false,
        provider: 'serpapi',
        total: 10,
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

      // Set search context
      setContext({
        id: 'test-whoemtalha',
        type: 'name',
        query: 'whoemtalha',
        platforms: ['instagram', 'facebook', 'tiktok', 'linkedin'],
        isDemo: false,
        provider: 'serpapi',
      });

      window.location.hash = '#/results';
      render(<App />);

      // Wait for search results to load
      expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();
      expect(await screen.findByText('Public web results')).toBeTruthy();

      // All Results must equal unique results in the active result set (1, not 10)
      const allResultsTab = await screen.findByRole('tab', { name: /All Results/ });
      expect(allResultsTab.textContent).toContain('1');
      expect(allResultsTab.textContent).not.toContain('10');

      // Instagram count must be 1
      const instaTab = await screen.findByRole('tab', { name: /Instagram/ });
      expect(instaTab.textContent).toContain('1');

      // LinkedIn count must be 0 (not 10!)
      const linkedinTab = await screen.findByRole('tab', { name: /LinkedIn/ });
      expect(linkedinTab.textContent).toContain('0');

      // Facebook and TikTok counts must be 0
      const fbTab = await screen.findByRole('tab', { name: /Facebook/ });
      expect(fbTab.textContent).toContain('0');
      const tiktokTab = await screen.findByRole('tab', { name: /TikTok/ });
      expect(tiktokTab.textContent).toContain('0');

      // Exact section count must be 1, matching the 1 rendered exact match card
      const exactHeading = await screen.findByRole('heading', { name: /Exact Name \/ Username Matches/ });
      expect(exactHeading.textContent).toContain('1');

      // Result card must show Instagram, NOT LinkedIn
      expect(screen.queryByText('Public LinkedIn source')).toBeNull();
      expect(await screen.findByText('Public Instagram source')).toBeTruthy();
    });

    it('does not assign unknown domain URLs to known platforms and displays "Other" tab', async () => {
      const mockApiResponse = {
        results: [
          {
            id: 'res-unknown-1',
            platform: 'linkedin',
            user: 'whoemtalha',
            caption: 'Personal blog of whoemtalha',
            date: '2026-03-01',
            matchType: 'Name Match',
            confidence: 0,
            img: '',
            sourceUrl: 'https://randomblog.org/whoemtalha',
            isDemo: false,
            provider: 'serpapi',
          },
          {
            id: 'res-insta-1',
            platform: 'linkedin',
            user: 'whoemtalha',
            caption: 'Instagram profile',
            date: '2026-03-01',
            matchType: 'Name Match',
            confidence: 0,
            img: '',
            sourceUrl: 'https://www.instagram.com/whoemtalha',
            isDemo: false,
            provider: 'serpapi',
          },
        ],
        isDemo: false,
        provider: 'serpapi',
        total: 2,
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
        id: 'test-unknown-platform',
        type: 'name',
        query: 'whoemtalha-unknown',
        platforms: ['instagram', 'facebook', 'tiktok', 'linkedin'],
        isDemo: false,
        provider: 'serpapi',
      });

      window.location.hash = '#/results';
      render(<App />);

      expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();
      expect(await screen.findByText('Public web results')).toBeTruthy();

      // All Results = 2
      await waitFor(() => {
        const allTab = screen.getByRole('tab', { name: /All Results/ });
        expect(allTab.textContent).toContain('2');
      });

      // Instagram = 1
      const instaTab = await screen.findByRole('tab', { name: /Instagram/ });
      expect(instaTab.textContent).toContain('1');

      // Other = 1
      const otherTab = await screen.findByRole('tab', { name: /Other/ });
      expect(otherTab.textContent).toContain('1');

      // Known platforms are not inflated
      const linkedinTab = await screen.findByRole('tab', { name: /LinkedIn/ });
      expect(linkedinTab.textContent).toContain('0');
      const fbTab = await screen.findByRole('tab', { name: /Facebook/ });
      expect(fbTab.textContent).toContain('0');
      const tiktokTab = await screen.findByRole('tab', { name: /TikTok/ });
      expect(tiktokTab.textContent).toContain('0');
    });

    it('preserves demo fixtures and platform filtering for demo search', async () => {
      // Demo search for "sarah khan"
      setContext({
        id: 'test-demo-sarah',
        type: 'name',
        query: 'sarah khan',
        platforms: ['instagram', 'facebook', 'tiktok', 'linkedin'],
        isDemo: true,
        provider: 'demo',
      });

      window.location.hash = '#/results';
      render(<App />);

      expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();
      expect(await screen.findByText('Demo preview')).toBeTruthy();

      const allTab = await screen.findByRole('tab', { name: /All Results/ });
      // Should have demo results
      expect(allTab).toBeTruthy();

      // Click Instagram tab
      const instaTab = await screen.findByRole('tab', { name: /Instagram/ });
      fireEvent.click(instaTab);

      // Verify that cards shown belong to Instagram
      await waitFor(() => {
        expect(instaTab.getAttribute('aria-selected')).toBe('true');
      });
    });
  });
});
