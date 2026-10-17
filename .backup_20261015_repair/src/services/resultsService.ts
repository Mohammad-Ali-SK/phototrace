import type {PlatformId} from './photoSearchService';
import type {SearchContext} from './searchSession';
import {api} from './api';
import p1 from '../assets/p1.jpg';
import p2 from '../assets/p2.jpg';
import p3 from '../assets/p3.jpg';
import p4 from '../assets/p4.jpg';
import p5 from '../assets/p5.jpg';
import p6 from '../assets/p6.jpg';
import p7 from '../assets/p7.jpg';
import p8 from '../assets/p8.jpg';
import p9 from '../assets/p9.jpg';

export type MatchType = 'Exact Image Match' | 'Similar Image' | 'Name Match';

export interface DemoResult {
  id: string;
  platform: PlatformId;
  user: string;
  caption: string;
  date: string;
  match: MatchType;
  confidence: number;
  img: string;
  sourceUrl: string | null;
  isDemo?: boolean;
  provider?: string;
  metadata?: Record<string, unknown>;
}

const E = 'Exact Image Match', S = 'Similar Image';
const rows: [PlatformId, string, string, string, MatchType, number, string][] = [
  ['tiktok', '@sarah_diaries', 'Golden hour walk 🌅 #vlog', '2026-09-28', E, 98, p1],
  ['tiktok', '@city.clips', 'Weekend dance challenge', '2026-09-10', S, 84, p6],
  ['tiktok', '@travel.with.s', 'Coffee run in Lisbon ☕', '2026-08-15', S, 71, p9],
  ['instagram', '@sarahofficial', 'Exploring the world ✈️ Travel | Life', '2026-10-02', E, 95, p2],
  ['instagram', '@s.k.photos', 'Sunset portrait series', '2026-09-20', S, 88, p5],
  ['instagram', '@wanderlust_sk', 'Beach day, no filter', '2026-08-02', S, 80, p8],
  ['instagram', '@studio.nine', 'Behind the scenes shoot', '2026-07-14', S, 66, p4],
  ['facebook', 'Sarah Khan', 'Profile photo update', '2026-09-18', E, 92, p7],
  ['facebook', 'S. Khan Photography', 'Album: Summer trip', '2026-08-09', S, 78, p3],
  ['facebook', 'Sarah K.', 'Shared a memory from 2021', '2026-06-30', S, 64, p2],
  ['linkedin', 'Sarah Khan – Software Engineer', 'Excited to join a new team!', '2026-09-05', E, 88, p6],
  ['linkedin', 'Sarah K. | Product Design', 'Speaking at DesignConf', '2026-06-12', S, 69, p8],
];

export const DATA: DemoResult[] = rows.map((r, i) => ({
  id: 'd' + (i + 1),
  platform: r[0],
  user: r[1],
  caption: r[2],
  date: r[3],
  match: r[4],
  confidence: r[5],
  img: r[6],
  sourceUrl: null,
  isDemo: true,
  provider: 'demo',
  metadata: {
    evidence: `Sample demo entry for persona 'Sarah Khan' on ${r[0]}.`,
    verified: false,
  }
}));

const CACHE_KEY = 'pt_results_cache';
const MEM_CACHE = new Map<string, DemoResult>();
DATA.forEach(d => MEM_CACHE.set(d.id, d));

export function saveToSession(items: DemoResult[]) {
  try {
    const existing = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    items.forEach(it => {
      MEM_CACHE.set(it.id, it);
      existing[it.id] = it;
    });
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(existing));
  } catch {
    items.forEach(it => MEM_CACHE.set(it.id, it));
  }
}

export function getCachedResult(id: string): DemoResult | undefined {
  if (MEM_CACHE.has(id)) return MEM_CACHE.get(id);
  try {
    const existing = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    if (existing[id]) {
      MEM_CACHE.set(id, existing[id]);
      return existing[id];
    }
  } catch {}
  return DATA.find(d => d.id === id);
}

export const demoResult = (id: string) => getCachedResult(id);

export async function fetchResults(c: SearchContext): Promise<DemoResult[]> {
  const q = c.query.trim().toLowerCase();

  // Simulated error state for testing
  if (q === 'error') {
    await new Promise(r => setTimeout(r, 200));
    throw new Error('Simulated demo error. Please try again.');
  }

  // Zero results triggers
  if (!q || q === 'empty' || q === 'john.doe') {
    await new Promise(r => setTimeout(r, 200));
    return [];
  }

  // Attempt backend API call if available
  try {
    if (c.type === 'name') {
      const resp = await api.searchName(c.query, c.platforms);
      if (resp && Array.isArray(resp.results) && resp.results.length > 0) {
        const mapped: DemoResult[] = resp.results.map((r, i) => ({
          id: r.id || `r_${i}`,
          platform: r.platform,
          user: r.user,
          caption: r.caption,
          date: r.date || new Date().toISOString().slice(0, 10),
          match: r.matchType,
          confidence: Math.round(r.confidence),
          img: r.img || DATA[i % DATA.length].img,
          sourceUrl: r.sourceUrl,
          isDemo: r.isDemo ?? true,
          provider: r.provider || 'demo',
          metadata: r.metadata,
        }));
        saveToSession(mapped);
        return mapped;
      }
    }
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 500) {
      throw e;
    }
  }

  // Demo fallback
  await new Promise(r => setTimeout(r, 300));

  if (c.type === 'name') {
    const tokens = q.split(/[\s._@-]+/).filter(t => t.length >= 2);
    const isSarah = tokens.some(t => ['sarah', 'khan', 'sk'].includes(t)) || q.includes('sarah khan');

    if (isSarah) {
      const res = DATA.filter(d => c.platforms.includes(d.platform)).map(d => ({
        ...d,
        match: 'Name Match' as MatchType,
        isDemo: true,
        provider: 'demo',
      }));
      saveToSession(res);
      return res;
    }

    if (q.includes('travel')) {
      const res = DATA.filter(d => c.platforms.includes(d.platform) && ((d.user + ' ' + d.caption).toLowerCase().includes('travel') || d.caption.toLowerCase().includes('lisbon'))).map(d => ({
        ...d,
        match: 'Name Match' as MatchType,
        isDemo: true,
        provider: 'demo',
      }));
      saveToSession(res);
      return res;
    }

    const matched = DATA.filter(d => {
      if (!c.platforms.includes(d.platform)) return false;
      const haystack = `${d.user} ${d.caption} ${d.platform}`.toLowerCase();
      return tokens.some(t => haystack.includes(t));
    }).map(d => ({ ...d, match: 'Name Match' as MatchType, isDemo: true, provider: 'demo' }));

    saveToSession(matched);
    return matched;
  }

  // Photo search results
  const res = DATA.filter(d => c.platforms.includes(d.platform)).map(d => ({
    ...d,
    isDemo: true,
    provider: 'demo',
  }));
  saveToSession(res);
  return res;
}
