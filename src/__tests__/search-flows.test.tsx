import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { setContext, setExecution } from '../services/searchSession';
import { DATA, saveToSession } from '../services/resultsService';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PhotoTrace AI - Search & Navigation Flows', () => {
  it('1. Name search with matching demo data displays results cards', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'sarah khan' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();
    expect(await screen.findByText('“sarah khan”')).toBeTruthy();
    const detailsButtons = await screen.findAllByRole('link', { name: /View Details/ });
    expect(detailsButtons.length).toBeGreaterThan(0);
  });

  it('2. Name search with zero results shows empty state', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'empty' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();
    expect(await screen.findByText(/No matching demo content/)).toBeTruthy();
  });

  it('2b. Name search for "mohammad ali" returns empty state and never falls back to Sarah Khan demo items', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'mohammad ali' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();
    expect(await screen.findByText('“mohammad ali”')).toBeTruthy();
    expect(await screen.findByText(/No matching demo content/)).toBeTruthy();
    // Ensure no Sarah Khan cards are rendered
    expect(screen.queryByText('@sarah_diaries')).toBeNull();
    expect(screen.queryByText('@sarahofficial')).toBeNull();
  });

  it('3. Name search validates invalid input (empty and 1 character)', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    const form = input.closest('form')!;

    // Empty submission
    fireEvent.submit(form);
    expect((await screen.findByRole('alert')).textContent).toMatch(/enter a name or username/);

    // 1 character submission
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.submit(form);
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 2 characters/);
  });

  it('4. Photo search validates file type and rejects unsupported files', async () => {
    window.location.hash = '#/search/photo';
    render(<App />);

    const fileInput = await screen.findByLabelText('Choose image');
    const searchBtn = screen.getByRole('button', { name: /Search Across Platforms/ }) as HTMLButtonElement;
    expect(searchBtn.disabled).toBe(true);

    const badFile = new File(['fake gif data'], 'image.gif', { type: 'image/gif' });
    fireEvent.change(fileInput, { target: { files: [badFile] } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not supported/i);
    expect(searchBtn.disabled).toBe(true);
  });

  it('5. Photo search allows selecting sample image and searches across selected platforms', async () => {
    window.location.hash = '#/search/photo';
    render(<App />);

    // Click sample image
    const sampleBtn = await screen.findByRole('button', { name: /Use sample-sunset-burgundy.jpg/ });
    fireEvent.click(sampleBtn);

    // Platform toggle: deselect TikTok
    fireEvent.click(screen.getByRole('button', { name: /^TikTok/ }));
    expect(screen.getByText('3 of 4 selected')).toBeTruthy();

    const searchBtn = await screen.findByRole('button', { name: /Search Across Platforms/ });
    await waitFor(() => expect((searchBtn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(searchBtn);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 8000 })).toBeTruthy();
    expect(screen.getByText('Photo Search')).toBeTruthy();
  }, 15000);

  it('5b. Uploaded custom image (Photo.jpeg) returns empty state and never displays Sarah Khan fixtures', async () => {
    window.location.hash = '#/search/photo';
    render(<App />);

    const fileInput = await screen.findByLabelText('Choose image');
    const validFile = new File(['fake-jpg-content'], 'Photo.jpeg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    const searchBtn = await screen.findByRole('button', { name: /Search Across Platforms/ });
    await waitFor(() => expect((searchBtn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(searchBtn);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 8000 })).toBeTruthy();
    expect(screen.getByText('Photo Search')).toBeTruthy();
    expect(screen.getAllByText('Photo.jpeg').length).toBeGreaterThan(0);
    expect(screen.queryByText('@sarah_diaries')).toBeNull();
    expect(screen.queryByText('@sarahofficial')).toBeNull();
    expect(await screen.findByRole('heading', { name: /No demo matches found/i })).toBeTruthy();
    expect(screen.getByText(/Live reverse-image search is not currently configured/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Try Another Photo/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Change Platforms/i })).toBeTruthy();
  }, 15000);

  it('6. Results filtering by platform tabs and sorting controls work', async () => {
    setContext({
      id: 'test-filter',
      type: 'name',
      query: 'sarah khan',
      platforms: ['tiktok', 'instagram', 'facebook', 'linkedin'],
    });
    window.location.hash = '#/results';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();
    const allTab = await screen.findByRole('tab', { name: /All Results/ });
    expect(allTab).toBeTruthy();

    // Click Instagram tab
    const instaTab = screen.getByRole('tab', { name: /Instagram/ });
    fireEvent.click(instaTab);
    expect(instaTab.getAttribute('aria-selected')).toBe('true');

    // Change sorting
    const sortSelect = screen.getByLabelText(/Sort by/);
    fireEvent.change(sortSelect, { target: { value: 'recent' } });
    expect((sortSelect as HTMLSelectElement).value).toBe('recent');
  });

  it('7. Opening a result details page displays verified metadata and source status', async () => {
    window.location.hash = '#/details/d1';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Match Details' })).toBeTruthy();
    expect(screen.getByText('@sarah_diaries')).toBeTruthy();
    expect(screen.getByText('TikTok')).toBeTruthy();
    expect(screen.getAllByText(/Match/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Preview only – no source link/)).toBeTruthy();
  });

  it('8. Returning to results preserves search context without losing state', async () => {
    setContext({
      id: 'test-back',
      type: 'name',
      query: 'sarah khan',
      platforms: ['instagram', 'facebook', 'linkedin'],
    });

    window.location.hash = '#/details/d4';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Match Details' })).toBeTruthy();
    const backBtns = screen.getAllByRole('link', { name: /Back to results/ });
    fireEvent.click(backBtns[0]);

    expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeTruthy();
    expect(screen.getByText('“sarah khan”')).toBeTruthy();
  });

  it('9. Error state and retry button handle simulated failures', async () => {
    setContext({
      id: 'test-error',
      type: 'name',
      query: 'error',
      platforms: ['instagram'],
    });

    window.location.hash = '#/results';
    render(<App />);

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    expect(retryBtn).toBeTruthy();
  });

  it('10. Existing application routes render cleanly', async () => {
    const routes = ['#/', '#/search/photo', '#/search/name', '#/login', '#/signup'];
    for (const r of routes) {
      window.location.hash = r;
      cleanup();
      render(<App />);
      expect(document.body.innerHTML.length).toBeGreaterThan(50);
    }
  });

  it('11. Name search loading state resets and displays error when backend returns 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify({ detail: 'SerpApi request timed out for linkedin.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{"detail":"no"}', { status: 401 });
    }));

    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'Taylor Swift' } });
    const form = input.closest('form')!;
    const submitBtn = form.querySelector('button[type="submit"]')!;

    fireEvent.submit(form);

    // Verify error is displayed and busy state is cleared
    expect(await screen.findByText('SerpApi request timed out for linkedin.', {}, { timeout: 4000 })).toBeTruthy();
    expect(submitBtn.hasAttribute('disabled')).toBe(false);
    expect(submitBtn.getAttribute('aria-busy')).toBe('false');
  });

  it('12. Name search loading state resets on network abort/timeout and does not silently fall back to demo fixtures', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/search/name')) {
        const err = new DOMException('The user aborted a request.', 'AbortError');
        throw err;
      }
      return new Response('{"detail":"no"}', { status: 401 });
    }));

    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'Taylor Swift' } });
    const form = input.closest('form')!;
    const submitBtn = form.querySelector('button[type="submit"]')!;

    fireEvent.submit(form);

    expect(await screen.findByText(/Search request timed out/i, {}, { timeout: 4000 })).toBeTruthy();
    expect(submitBtn.hasAttribute('disabled')).toBe(false);
    // Did not navigate to results page or display Sarah Khan fixtures
    expect(screen.queryByText(/@sarah_diaries/)).toBeNull();
  });

  it('13. Live Name Search displays genuine image if present, neutral initials avatar if absent, and never uses demo girl images', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify({
          query: 'Amir sk',
          searchType: 'name',
          platforms: ['tiktok', 'instagram'],
          isDemo: false,
          results: [
            {
              id: 'tiktok-amir-1',
              platform: 'tiktok',
              user: 'Amir Sk',
              handle: '@amirsk_official',
              url: 'https://tiktok.com/@amirsk_official',
              matchType: 'Name Match',
              confidence: 90,
              firstSeen: '2023-01-01',
              notes: 'Public profile found on TikTok',
              img: 'https://images.example.com/amir-actual.jpg',
              isDemo: false,
            },
            {
              id: 'instagram-amir-2',
              platform: 'instagram',
              user: 'Amir SK',
              handle: '@amir.sk',
              url: 'https://instagram.com/amir.sk',
              matchType: 'Name Match',
              confidence: 85,
              firstSeen: '2023-02-01',
              notes: 'Public profile found on Instagram',
              img: null,
              isDemo: false,
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{"detail":"no"}', { status: 401 });
    }));

    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'Amir sk' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // 1. Genuine image is rendered for TikTok result
    const amirImg = screen.getByAltText('Profile preview for Amir Sk') as HTMLImageElement;
    expect(amirImg).toBeTruthy();
    expect(amirImg.src).toBe('https://images.example.com/amir-actual.jpg');

    // 2. Instagram result has no image: renders fallback initials avatar
    const igFallback = screen.getByTestId('avatar-fallback-instagram');
    expect(igFallback).toBeTruthy();
    expect(igFallback.textContent).toContain('AS');

    // 3. Neither result uses Sarah Khan demo pictures (p1.jpg, p2.jpg, etc.)
    const allImages = screen.getAllByRole('img');
    for (const img of allImages) {
      expect((img as HTMLImageElement).src).not.toMatch(/p\d+\.jpg$/);
    }

    // 4. Badges show "Public Source" instead of "Demo Result"
    const publicBadges = screen.getAllByText('Public Source');
    expect(publicBadges.length).toBe(2);
    expect(screen.queryByText('Demo Result')).toBeNull();
  });

  it('14. Details Page renders platform initials fallback for live result lacking an image', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify({
          query: 'Amir sk',
          searchType: 'name',
          platforms: ['instagram'],
          isDemo: false,
          results: [
            {
              id: 'instagram-amir-no-img',
              platform: 'instagram',
              user: 'Amir SK',
              handle: '@amir.sk',
              url: 'https://instagram.com/amir.sk',
              matchType: 'Name Match',
              confidence: 85,
              firstSeen: '2023-02-01',
              notes: 'Public profile found on Instagram',
              img: null,
              isDemo: false,
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{"detail":"no"}', { status: 401 });
    }));

    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'Amir sk' } });
    fireEvent.submit(input.closest('form')!);

    const viewDetails = await screen.findByRole('link', { name: /View Details/i }, { timeout: 4000 });
    fireEvent.click(viewDetails);

    expect(await screen.findByRole('heading', { name: 'Match Details' }, { timeout: 4000 })).toBeTruthy();
    const detailsFallback = await screen.findByTestId('details-fallback-instagram');
    expect(detailsFallback).toBeTruthy();
    expect(detailsFallback.textContent).toContain('AS');
    expect(detailsFallback.textContent).toContain('No direct thumbnail indexed');
  });

  it('15. Live SerpApi search (e.g. "Rupsona") renders "Public web results", removes demo disclaimers, and displays "Rerun search"', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify({
          query: 'Rupsona',
          searchType: 'name',
          platforms: ['tiktok', 'instagram', 'facebook', 'linkedin'],
          isDemo: false,
          provider: 'serpapi',
          results: [
            {
              id: 'rupsona-1',
              platform: 'tiktok',
              user: 'Rupsona Khatun',
              handle: '@rupsona_official',
              url: 'https://tiktok.com/@rupsona_official',
              matchType: 'Name Match',
              confidence: 92,
              firstSeen: '2023-01-01',
              notes: 'Public profile found on TikTok',
              img: 'https://images.example.com/rupsona.jpg',
              isDemo: false,
              provider: 'serpapi',
            },
            {
              id: 'rupsona-2',
              platform: 'instagram',
              user: 'Rupsona Parvin',
              handle: '@rupsona.p',
              url: 'https://instagram.com/rupsona.p',
              matchType: 'Name Match',
              confidence: 88,
              firstSeen: '2023-02-01',
              notes: 'Public profile found on Instagram',
              img: null,
              isDemo: false,
              provider: 'serpapi',
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{"detail":"no"}', { status: 401 });
    }));

    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'Rupsona' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // 1. Header badge must be "Public web results", not "Demo preview"
    expect(screen.getByText('Public web results')).toBeTruthy();
    expect(screen.queryByText('Demo preview')).toBeNull();

    // 2. Result count summary must say "2 public results", not "2 demo results"
    expect(screen.getByText('2 public results')).toBeTruthy();
    expect(screen.queryByText(/2 demo results/)).toBeNull();

    // 3. Action button must say "Rerun search", not "Rerun demo"
    expect(screen.getByRole('button', { name: /Rerun search/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Rerun demo/i })).toBeNull();

    // 4. Note banner must explain public web results via SerpApi and not claim "These are sample examples, not real discoveries"
    expect(screen.getByText(/Public web search results/i)).toBeTruthy();
    expect(screen.getByText(/via SerpApi/i)).toBeTruthy();
    expect(screen.queryByText(/These are sample examples, not real discoveries/i)).toBeNull();

    // 5. Card badges say "Public Source" (under broader results for < 70% match)
    fireEvent.click(screen.getByRole('button', { name: /Show broader results/i }));
    expect(screen.getAllByText('Public Source').length).toBe(2);
  });

  it('16. Live search with 0 results displays "No public results found" instead of demo empty message', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify({
          query: 'NonexistentPersonXyZ',
          searchType: 'name',
          platforms: ['tiktok', 'instagram'],
          isDemo: false,
          provider: 'serpapi',
          results: []
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{"detail":"no"}', { status: 401 });
    }));

    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'NonexistentPersonXyZ' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // Must show live empty state
    expect(await screen.findByText('No public results found')).toBeTruthy();
    expect(screen.queryByText('No matching demo content')).toBeNull();
    expect(screen.getByText('Public web results')).toBeTruthy();
    expect(screen.getByText('0 public results')).toBeTruthy();
  });

  it('17. Demo search preserves "Demo preview", "demo results", "Rerun demo", and demo disclaimer', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'sarah khan' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // Demo state preserved
    expect(screen.getByText('Demo preview')).toBeTruthy();
    expect(screen.getByText(/12 demo results/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Rerun demo/i })).toBeTruthy();
    expect(screen.getByText(/These are sample examples, not real discoveries/i)).toBeTruthy();
  });

  it('18. Multi-platform results separate into Exact and Similar sections and preserve platform priority', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'sarah khan' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // Verify two section headings exist
    expect(screen.getByRole('heading', { name: /Exact Name \/ Username Matches/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Similar Name \/ Username Matches/i })).toBeTruthy();

    // In demo data for 'sarah khan':
    // Exact match section contains 'Sarah Khan' (Facebook)
    const exactHeading = screen.getByRole('heading', { name: /Exact Name \/ Username Matches/i });
    expect(exactHeading.textContent).toContain('1');

    // Similar match section (70%-90%) contains 'Sarah K.' (70%)
    const similarHeading = screen.getByRole('heading', { name: /Similar Name \/ Username Matches/i });
    expect(similarHeading.textContent).toContain('1');

    // Clicking "Show broader results" reveals the remaining 10 cards
    const broaderBtn = screen.getByRole('button', { name: /Show broader results/i });
    expect(broaderBtn).toBeTruthy();
    fireEvent.click(broaderBtn);

    const cards = document.querySelectorAll('article');
    expect(cards.length).toBe(12);
  });

  it('19. Match percentage is styled in noticeably bold green (font-extrabold text-emerald-600), separate from badge', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'sarah khan' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    const firstCard = document.querySelector('article')!;
    // Match badge is separate
    expect(firstCard.querySelector('.bg-amber-100')?.textContent).toBe('Name Match');

    // Percentage element is font-extrabold green
    const scoreElem = firstCard.querySelector('.text-emerald-600');
    expect(scoreElem).toBeTruthy();
    expect(scoreElem?.textContent).toBe('100%');
    expect(scoreElem?.className).toContain('font-extrabold');

    // Similarity label
    expect(firstCard.textContent).toContain('Name similarity');
    expect(firstCard.textContent).toContain('(illustrative)');
  });

  it('20. Live results without verified score display neutral "Public result" and do not fabricate a percentage', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify({
          query: 'Unknown Person',
          searchType: 'name',
          platforms: ['instagram'],
          isDemo: false,
          provider: 'serpapi',
          results: [
            {
              id: 'unknown-1',
              platform: 'instagram',
              user: '', // Missing / empty profile user
              handle: '',
              url: null,
              matchType: 'Name Match',
              confidence: 0, // No fabricated confidence score
              firstSeen: '2023-01-01',
              notes: 'Public profile without reliable identity',
              img: null,
              isDemo: false,
              provider: 'serpapi',
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{"detail":"no"}', { status: 401 });
    }));

    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'Unknown Person' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // Reveal broader / unclassified result
    fireEvent.click(screen.getByRole('button', { name: /Show broader results/i }));

    // Must display "Public result" instead of a percentage on the card
    const card = screen.getByText('Public result').closest('article')!;
    expect(card).toBeTruthy();
    expect(card.querySelector('.text-emerald-600')).toBeNull();
    expect(card.textContent).not.toContain('%');
  });

  it('21. Platform filter and "Sort by" dropdown integrate correctly across sections', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'sarah khan' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // Filter to Facebook only
    const fbTab = screen.getByRole('tab', { name: /Facebook/i });
    fireEvent.click(fbTab);

    // Exact section on Facebook has 'Sarah Khan'
    const exactHeading = screen.getByRole('heading', { name: /Exact Name \/ Username Matches/i });
    expect(exactHeading.textContent).toContain('1');

    // Similar section on Facebook has 'Sarah K.'
    const similarHeading = screen.getByRole('heading', { name: /Similar Name \/ Username Matches/i });
    expect(similarHeading.textContent).toContain('1');

    // Switch to Instagram only
    const instaTab = screen.getByRole('tab', { name: /Instagram/i });
    fireEvent.click(instaTab);

    // No exact or similar matches on Instagram for 'sarah khan'
    expect(screen.getByText('No exact name or username matches found across selected platforms.')).toBeTruthy();
    expect(screen.getByText('No similar matches (70%–90%) found across selected platforms.')).toBeTruthy();
  });

  it('22. Exact case-insensitive name and username matching', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    // Case-insensitive query 'SARAH KHAN'
    fireEvent.change(input, { target: { value: 'SARAH KHAN' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    const exactHeading = screen.getByRole('heading', { name: /Exact Name \/ Username Matches/i });
    expect(exactHeading.textContent).toContain('1');
    expect(screen.getByText('Sarah Khan')).toBeTruthy();
  });

  it('23. Partial matches never enter the Exact section', async () => {
    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    // Query 'sarah' is a partial substring of 'Sarah Khan', not exact
    fireEvent.change(input, { target: { value: 'sarah' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // Exact section must have 0 matches
    const exactHeading = screen.getByRole('heading', { name: /Exact Name \/ Username Matches/i });
    expect(exactHeading.textContent).toContain('0');
    expect(screen.getByText('No exact name or username matches found across selected platforms.')).toBeTruthy();
  });

  it('24. Similarity scores from 70% to 90% appear only in Similar, scores outside do not enter either section', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/search/name')) {
        return new Response(JSON.stringify({
          query: 'Taylor Swift',
          searchType: 'name',
          platforms: ['instagram', 'tiktok', 'facebook'],
          isDemo: false,
          provider: 'serpapi',
          results: [
            {
              id: 't-exact',
              platform: 'instagram',
              user: 'Taylor Swift', // Exact 100%
              matchType: 'Name Match',
              confidence: 0,
              isDemo: false,
              provider: 'serpapi',
            },
            {
              id: 't-similar-90',
              platform: 'tiktok',
              user: 'Taylor Swif', // Distance 1/12 -> 92% -> outside 70-90
              matchType: 'Name Match',
              confidence: 0,
              isDemo: false,
              provider: 'serpapi',
            },
            {
              id: 't-similar-83',
              platform: 'tiktok',
              user: 'Taylor Sw', // Distance 3/12 -> 75% -> in [70, 90]
              matchType: 'Name Match',
              confidence: 0,
              isDemo: false,
              provider: 'serpapi',
            },
            {
              id: 't-low-50',
              platform: 'facebook',
              user: 'Taylor', // 50% -> below 70
              matchType: 'Name Match',
              confidence: 0,
              isDemo: false,
              provider: 'serpapi',
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{"detail":"no"}', { status: 401 });
    }));

    window.location.hash = '#/search/name';
    render(<App />);

    const input = await screen.findByLabelText('Name or username');
    fireEvent.change(input, { target: { value: 'Taylor Swift' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // Exact has exactly 1 (Taylor Swift)
    const exactHeading = screen.getByRole('heading', { name: /Exact Name \/ Username Matches/i });
    expect(exactHeading.textContent).toContain('1');

    // Similar has exactly 1 (Taylor Sw at 75%)
    const similarHeading = screen.getByRole('heading', { name: /Similar Name \/ Username Matches/i });
    expect(similarHeading.textContent).toContain('1');

    // Other has 2 (92% and 50%)
    expect(screen.getByText(/Broader & Unclassified Results/i)).toBeTruthy();
  });

  it('25. Photo search separates Exact and Similar matches, shows visual similarity notice, and displays "No exact source image duplicates found." when exact count is zero', async () => {
    setContext({
      id: 'photo-test-zero-exact',
      type: 'photo',
      query: 'my_reference_face.jpg',
      fileName: 'my_reference_face.jpg',
      platforms: ['instagram', 'facebook'],
    });

    setExecution({
      id: 'photo-test-zero-exact',
      type: 'photo',
      query: 'my_reference_face.jpg',
      fileName: 'my_reference_face.jpg',
      platforms: ['instagram', 'facebook'],
      status: 'ok',
      provider: 'serpapi',
      isDemo: false,
      results: [
        {
          id: 'ps-vis-1',
          platform: 'instagram',
          user: 'Visual Lookalike 1',
          caption: 'Sunset portrait',
          date: '2026-10-14',
          match: 'Similar Image',
          confidence: 0,
          img: 'https://images.example.com/lookalike1.jpg',
          sourceUrl: 'https://instagram.com/p/lookalike1',
          isDemo: false,
          provider: 'serpapi',
        },
        {
          id: 'ps-vis-2',
          platform: 'facebook',
          user: 'Visual Lookalike 2',
          caption: 'Profile photo',
          date: '2026-10-15',
          match: 'Similar Image',
          confidence: 0,
          img: 'https://images.example.com/lookalike2.jpg',
          sourceUrl: 'https://facebook.com/lookalike2',
          isDemo: false,
          provider: 'serpapi',
        }
      ],
      timestamp: Date.now(),
    });

    window.location.hash = '#/results';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // 1. Clear user-facing notice explaining visual similarity does not confirm identity
    expect(screen.getByText(/Visual similarity does not confirm that results depict the same person/i)).toBeTruthy();

    // 2. Exact Image Matches section shows 0 and fallback message
    const exactHeading = screen.getByRole('heading', { name: /Exact Image Matches/i });
    expect(exactHeading.textContent).toContain('0');
    expect(screen.getByText('No exact source image duplicates found.')).toBeTruthy();

    // 3. Visually Similar Images section shows 2 matches
    const similarHeading = screen.getByRole('heading', { name: /Visually Similar (Images|Results)/i });
    expect(similarHeading.textContent).toContain('2');
    expect(screen.getByText('Visual Lookalike 1')).toBeTruthy();
    expect(screen.getByText('Visual Lookalike 2')).toBeTruthy();

    // 4. No fabricated confidence percentages
    const cards = screen.getAllByRole('article');
    for (const card of cards) {
      expect(card.textContent).toContain('Public result');
      expect(card.textContent).not.toContain('%');
    }
  });

  it('26. Photo search with both exact and visual matches separates both sections and preserves filtering', async () => {
    setContext({
      id: 'photo-test-both',
      type: 'photo',
      query: 'uploaded_profile.jpg',
      fileName: 'uploaded_profile.jpg',
      platforms: ['instagram', 'facebook'],
    });

    setExecution({
      id: 'photo-test-both',
      type: 'photo',
      query: 'uploaded_profile.jpg',
      fileName: 'uploaded_profile.jpg',
      platforms: ['instagram', 'facebook'],
      status: 'ok',
      provider: 'serpapi',
      isDemo: false,
      results: [
        {
          id: 'p-exact-1',
          platform: 'instagram',
          user: 'Original Account',
          caption: 'Original photo re-hosted here',
          date: '2026-10-10',
          match: 'Exact Image Match',
          confidence: 0,
          img: 'https://images.example.com/exact.jpg',
          sourceUrl: 'https://instagram.com/p/original',
          isDemo: false,
          provider: 'serpapi',
        },
        {
          id: 'p-similar-1',
          platform: 'facebook',
          user: 'Resembling User',
          caption: 'Resembling photo on Facebook',
          date: '2026-10-11',
          match: 'Similar Image',
          confidence: 0,
          img: 'https://images.example.com/similar.jpg',
          sourceUrl: 'https://facebook.com/similar',
          isDemo: false,
          provider: 'serpapi',
        }
      ],
      timestamp: Date.now(),
    });

    window.location.hash = '#/results';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // Both sections populated
    const exactHeading = screen.getByRole('heading', { name: /Exact Image Matches/i });
    expect(exactHeading.textContent).toContain('1');
    expect(screen.getByText('Original Account')).toBeTruthy();

    const similarHeading = screen.getByRole('heading', { name: /Visually Similar (Images|Results)/i });
    expect(similarHeading.textContent).toContain('1');
    expect(screen.getByText('Resembling User')).toBeTruthy();

    // Filter to Instagram tab
    const instaTab = screen.getByRole('tab', { name: /Instagram/i });
    fireEvent.click(instaTab);

    // Exact still 1, Similar becomes 0 with empty message (re-query after DOM remount)
    const exactHeadingAfter = screen.getByRole('heading', { name: /Exact Image Matches/i });
    const similarHeadingAfter = screen.getByRole('heading', { name: /Visually Similar (Images|Results)/i });
    expect(exactHeadingAfter.textContent).toContain('1');
    expect(similarHeadingAfter.textContent).toContain('0');
    expect(screen.getByText('No visually similar matches found across selected platforms.')).toBeTruthy();
  });

  it('27. Details Page displays explicit visual similarity notice for results tagged "Similar Image"', async () => {
    const simResult = {
      id: 'p-details-sim',
      platform: 'facebook' as const,
      user: 'Lookalike User',
      caption: 'Visual resemblance result',
      date: '2026-10-11',
      match: 'Similar Image' as const,
      confidence: 0,
      img: 'https://images.example.com/similar.jpg',
      sourceUrl: 'https://facebook.com/lookalike',
      isDemo: false,
      provider: 'serpapi',
    };

    saveToSession([simResult]);

    setContext({
      id: 'photo-details-test',
      type: 'photo',
      query: 'uploaded_profile.jpg',
      platforms: ['facebook'],
    });

    setExecution({
      id: 'photo-details-test',
      type: 'photo',
      query: 'uploaded_profile.jpg',
      platforms: ['facebook'],
      status: 'ok',
      provider: 'serpapi',
      isDemo: false,
      results: [simResult],
      timestamp: Date.now(),
    });

    window.location.hash = '#/details/p-details-sim';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Match Details' }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/Visual Similarity Notice/i)).toBeTruthy();
    expect(screen.getByText(/Visual similarity does not confirm that this result depicts the same person/i)).toBeTruthy();
  });

  it('28. Photo search with optional name separates Exact, Similar, and Name-Related sections', async () => {
    const exactItem = {
      id: 'p-comb-exact',
      platform: 'instagram' as const,
      user: 'Verified Account',
      caption: 'Original post',
      date: '2026-10-12',
      match: 'Exact Image Match' as const,
      confidence: 0,
      img: 'https://images.example.com/exact.jpg',
      sourceUrl: 'https://instagram.com/verified',
      isDemo: false,
      provider: 'serpapi',
    };
    const similarItem = {
      id: 'p-comb-similar',
      platform: 'instagram' as const,
      user: 'Style Twin',
      caption: 'Lookalike image',
      date: '2026-10-11',
      match: 'Similar Image' as const,
      confidence: 0,
      img: 'https://images.example.com/similar.jpg',
      sourceUrl: 'https://instagram.com/twin',
      isDemo: false,
      provider: 'serpapi',
    };
    const nameItem = {
      id: 'p-comb-name',
      platform: 'facebook' as const,
      user: 'Jane Doe',
      caption: 'Public profile for Jane Doe',
      date: '2026-10-10',
      match: 'Name Match' as const,
      confidence: 0,
      img: 'https://images.example.com/name.jpg',
      sourceUrl: 'https://facebook.com/janedoe',
      isDemo: false,
      provider: 'serpapi',
    };

    saveToSession([exactItem, similarItem, nameItem]);

    setContext({
      id: 'comb-search-test',
      type: 'photo',
      query: 'photo.jpg + Jane Doe',
      fileName: 'photo.jpg',
      platforms: ['instagram', 'facebook'],
      isDemo: false,
      provider: 'serpapi',
    });

    setExecution({
      id: 'comb-search-test',
      type: 'photo',
      query: 'photo.jpg + Jane Doe',
      fileName: 'photo.jpg',
      platforms: ['instagram', 'facebook'],
      status: 'ok',
      provider: 'serpapi',
      isDemo: false,
      results: [exactItem, similarItem, nameItem],
      timestamp: Date.now(),
    });

    window.location.hash = '#/results';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Search Results' }, { timeout: 4000 })).toBeTruthy();

    // 1. Exact Image Matches section
    const exactHeading = screen.getByRole('heading', { name: /Exact Image Matches/i });
    expect(exactHeading.textContent).toContain('1');
    expect(screen.getByText('Verified Account')).toBeTruthy();

    // 2. Visually Similar Images section
    const similarHeading = screen.getByRole('heading', { name: /Visually Similar Images/i });
    expect(similarHeading.textContent).toContain('1');
    expect(screen.getByText('Style Twin')).toBeTruthy();

    // 3. Name-Related Public Pages section
    const nameHeading = screen.getByRole('heading', { name: /Name-Related Public Pages/i });
    expect(nameHeading.textContent).toContain('1');
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText(/A matching name or visually similar face does not prove that a result depicts the same person/i)).toBeTruthy();
  });

  it('29. Details page displays Name Match Notice for name-related result in combined search', async () => {
    const nameResult = {
      id: 'p-details-name',
      platform: 'facebook' as const,
      user: 'Jane Doe Official',
      caption: 'Public page matching Jane Doe',
      date: '2026-10-10',
      match: 'Name Match' as const,
      confidence: 0,
      img: 'https://images.example.com/jane.jpg',
      sourceUrl: 'https://facebook.com/janedoe',
      isDemo: false,
      provider: 'serpapi',
    };

    saveToSession([nameResult]);

    setExecution({
      id: 'photo-details-name-test',
      type: 'photo',
      query: 'photo.jpg + Jane Doe',
      platforms: ['facebook'],
      status: 'ok',
      provider: 'serpapi',
      isDemo: false,
      results: [nameResult],
      timestamp: Date.now(),
    });

    window.location.hash = '#/details/p-details-name';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Match Details' }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/Name Match Notice/i)).toBeTruthy();
    expect(screen.getByText(/A matching name or visually similar face does not prove that a result depicts the same person/i)).toBeTruthy();
  });
});



