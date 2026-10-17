import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { setContext } from '../services/searchSession';
import { DATA } from '../services/resultsService';

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
});
