import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import App from '../App';
import { setContext, clearExecution } from '../services/searchSession';
import { executeNameSearch } from '../services/resultsService';

describe('Live End-to-End Identity Resolver Integration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    clearExecution();
    window.location.hash = '';
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
  });

  afterEach(() => {
    cleanup();
    clearExecution();
    window.location.hash = '';
    vi.unstubAllGlobals();
  });

  it('performs live backend search for Bill Gates on LinkedIn and renders the exact enriched avatar in ResultsPage', async () => {
    // 1. Execute live backend search via executeNameSearch against running backend on port 8000
    const exec = await executeNameSearch('Bill Gates', ['linkedin']);

    expect(exec.status).toBe('ok');
    expect(exec.isDemo).toBe(false);
    expect(exec.provider).toBe('serpapi');
    expect(exec.results.length).toBeGreaterThan(0);

    // 2. Verify backend response contains enriched profile
    const enriched = exec.results.find(
      r => r.img && r.metadata?.photo_enriched_by === 'identity-resolver'
    );
    expect(enriched).toBeDefined();
    expect(enriched!.platform).toBe('linkedin');
    expect(enriched!.sourceUrl).toBe('https://www.linkedin.com/in/williamhgates');
    expect(enriched!.img).toMatch(/^https:\/\/ai\.mihajlo\.mk\/storage\/identity-resolver\/linkedin\//);

    const expectedImgUrl = enriched!.img!;

    // 3. Mount App in results page context for this search
    setContext({
      id: exec.id,
      query: 'Bill Gates',
      type: 'name',
      platforms: ['linkedin'],
      isDemo: false,
      provider: 'serpapi',
    });
    window.location.hash = '#/results';

    render(<App />);

    // 4. Verify the frontend renders the exact enriched image URL
    expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();
    const articles = await screen.findAllByRole('article');
    const linkedinCard = articles.find(a => a.innerHTML.includes('williamhgates'));
    const img = linkedinCard?.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe(expectedImgUrl);
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  }, 30000);

  it('performs live backend search for Mark Zuckerberg on Facebook and renders the exact enriched avatar in ResultsPage', async () => {
    // 1. Execute live backend search via executeNameSearch against running backend on port 8000
    const exec = await executeNameSearch('Mark Zuckerberg', ['facebook']);

    expect(exec.status).toBe('ok');
    expect(exec.isDemo).toBe(false);
    expect(exec.results.length).toBeGreaterThan(0);

    // 2. Verify backend response contains enriched profile
    const enriched = exec.results.find(
      r => r.img && r.metadata?.photo_enriched_by === 'identity-resolver'
    );
    expect(enriched).toBeDefined();
    expect(enriched!.platform).toBe('facebook');
    expect(enriched!.img).toMatch(/^https:\/\/ai\.mihajlo.mk\/storage\/identity-resolver\/facebook\//);

    const expectedImgUrl = enriched!.img!;

    // 3. Mount App in results page context for this search
    setContext({
      id: exec.id,
      query: 'Mark Zuckerberg',
      type: 'name',
      platforms: ['facebook'],
      isDemo: false,
      provider: 'serpapi',
    });
    window.location.hash = '#/results';

    render(<App />);

    // 4. Verify frontend renders exact image tag
    expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();
    const img = (await screen.findByAltText(`Profile preview for ${enriched!.user}`)) as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe(expectedImgUrl);
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  }, 30000);

});
