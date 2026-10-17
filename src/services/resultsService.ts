import type {PlatformId} from './photoSearchService';
import {SearchContext, SearchExecution, setExecution, getExecution} from './searchSession';
import {api, SearchApiResponse} from './api';
import {resolveResultPlatform, deduplicateResults} from './platformHelper';
import p1 from '../assets/p1.jpg';
import p2 from '../assets/p2.jpg';
import p3 from '../assets/p3.jpg';
import p4 from '../assets/p4.jpg';
import p5 from '../assets/p5.jpg';
import p6 from '../assets/p6.jpg';
import p7 from '../assets/p7.jpg';
import p8 from '../assets/p8.jpg';
import p9 from '../assets/p9.jpg';

export type MatchType = 'Exact Image Match' | 'Similar Image' | 'Name Match' | 'Demo Preview';

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

const E: MatchType = 'Demo Preview', S: MatchType = 'Demo Preview';
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

function mapApiResponse(resp: SearchApiResponse): DemoResult[] {
  const mapped: DemoResult[] = (resp.results || []).map((r, i) => {
    const isDemo = r.isDemo ?? resp.isDemo ?? true;
    let match = r.matchType;
    if (isDemo && (match === 'Exact Image Match' || match === 'Similar Image')) {
      match = 'Demo Preview';
    }
    const genuineImg = r.img && typeof r.img === 'string' && r.img.trim() ? r.img.trim() : null;
    const resolvedPlatform = resolveResultPlatform({
      platform: r.platform,
      sourceUrl: r.sourceUrl,
      isDemo,
    });
    return {
      id: r.id || `r_${i}`,
      platform: resolvedPlatform,
      user: r.user,
      caption: r.caption,
      date: r.date || new Date().toISOString().slice(0, 10),
      match,
      confidence: typeof r.confidence === 'number' && !isNaN(r.confidence) ? Math.round(r.confidence) : 0,
      img: isDemo ? (genuineImg || DATA[i % DATA.length].img) : (genuineImg || ''),
      sourceUrl: r.sourceUrl,
      isDemo,
      provider: r.provider || resp.provider || 'demo',
      metadata: r.metadata,
    };
  });
  return deduplicateResults(mapped);
}

/**
 * Execute a name search once authoritatively.
 */
export async function executeNameSearch(query: string, platforms: PlatformId[]): Promise<SearchExecution> {
  const q = query.trim();
  const ql = q.toLowerCase();
  const searchId = `name_${Date.now()}`;

  // Simulated error trigger
  if (ql === 'error') {
    await new Promise(r => setTimeout(r, 150));
    const exec: SearchExecution = {
      id: searchId,
      type: 'name',
      query: q,
      platforms,
      status: 'error',
      provider: 'demo',
      isDemo: true,
      results: [],
      error: 'Simulated demo error. Please try again.',
      timestamp: Date.now(),
    };
    setExecution(exec);
    throw new Error(exec.error);
  }

  // Simulated empty query
  if (!ql || ql === 'empty') {
    await new Promise(r => setTimeout(r, 150));
    const exec: SearchExecution = {
      id: searchId,
      type: 'name',
      query: q,
      platforms,
      status: 'empty',
      provider: 'demo',
      isDemo: true,
      results: [],
      message: 'No results found for this search.',
      timestamp: Date.now(),
    };
    setExecution(exec);
    return exec;
  }

  // Attempt backend API call
  try {
    const resp = await api.searchName(q, platforms);
    if (resp && Array.isArray(resp.results)) {
      const mapped = mapApiResponse(resp);
      saveToSession(mapped);
      const exec: SearchExecution = {
        id: searchId,
        type: 'name',
        query: q,
        platforms,
        status: mapped.length > 0 ? 'ok' : 'empty',
        provider: resp.provider || 'demo',
        isDemo: resp.isDemo ?? true,
        results: mapped,
        message: resp.message,
        timestamp: Date.now(),
      };
      setExecution(exec);
      return exec;
    }
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 500 || e?.status === 504 || e?.status === 502) {
      const exec: SearchExecution = {
        id: searchId,
        type: 'name',
        query: q,
        platforms,
        status: 'error',
        provider: 'backend',
        isDemo: false,
        results: [],
        error: e.message || 'Search service is currently unavailable. Please try again.',
        timestamp: Date.now(),
      };
      setExecution(exec);
      throw e;
    }
    // If connection failed / network offline (e.g. unit test mock), proceed to demo fallback
  }

  // Demo Fallback (Offline Mode only)
  await new Promise(r => setTimeout(r, 200));

  const tokens = ql.split(/[\s._@-]+/).filter(t => t.length >= 2);
  const isSarah = tokens.some(t => ['sarah', 'khan', 'sk'].includes(t)) || ql.includes('sarah khan');

  if (isSarah) {
    const res = DATA.filter(d => platforms.includes(d.platform)).map(d => ({
      ...d,
      match: 'Name Match' as MatchType,
      isDemo: true,
      provider: 'demo',
    }));
    saveToSession(res);
    const exec: SearchExecution = {
      id: searchId,
      type: 'name',
      query: q,
      platforms,
      status: res.length > 0 ? 'ok' : 'empty',
      provider: 'demo',
      isDemo: true,
      results: res,
      timestamp: Date.now(),
    };
    setExecution(exec);
    return exec;
  }

  if (ql.includes('travel')) {
    const res = DATA.filter(d => platforms.includes(d.platform) && ((d.user + ' ' + d.caption).toLowerCase().includes('travel') || d.caption.toLowerCase().includes('lisbon'))).map(d => ({
      ...d,
      match: 'Name Match' as MatchType,
      isDemo: true,
      provider: 'demo',
    }));
    saveToSession(res);
    const exec: SearchExecution = {
      id: searchId,
      type: 'name',
      query: q,
      platforms,
      status: res.length > 0 ? 'ok' : 'empty',
      provider: 'demo',
      isDemo: true,
      results: res,
      timestamp: Date.now(),
    };
    setExecution(exec);
    return exec;
  }

  // Any other search query (e.g. "mohammad ali") returns empty in demo mode
  const exec: SearchExecution = {
    id: searchId,
    type: 'name',
    query: q,
    platforms,
    status: 'empty',
    provider: 'demo',
    isDemo: true,
    results: [],
    message: `No matching demo content for '${q}' across selected platforms.`,
    timestamp: Date.now(),
  };
  setExecution(exec);
  return exec;
}

/**
 * Execute a photo search once authoritatively.
 */
export async function executePhotoSearch(
  image: Blob,
  fileName: string,
  platforms: PlatformId[],
  thumb?: string,
  isSample?: boolean,
  name?: string
): Promise<SearchExecution> {
  const searchId = `photo_${Date.now()}`;
  const cleanName = (name || '').trim() || undefined;
  const isSampleAsset = Boolean(
    isSample ||
    fileName.toLowerCase().startsWith('sample-') ||
    fileName.toLowerCase().includes('sample')
  );

  const displayQuery = cleanName ? `${fileName} + ${cleanName}` : fileName;

  try {
    const resp = await api.searchPhoto(image, fileName, platforms, isSampleAsset, cleanName);
    if (resp && Array.isArray(resp.results)) {
      const mapped = mapApiResponse(resp);
      saveToSession(mapped);
      const exec: SearchExecution = {
        id: searchId,
        type: 'photo',
        query: displayQuery,
        fileName,
        thumb,
        platforms,
        isSample: isSampleAsset,
        status: mapped.length > 0 ? 'ok' : 'empty',
        provider: resp.provider || 'demo',
        isDemo: resp.isDemo ?? true,
        results: mapped,
        message: resp.message,
        timestamp: Date.now(),
      };
      setExecution(exec);
      return exec;
    }
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 500 || e?.status === 504 || e?.status === 502) {
      const exec: SearchExecution = {
        id: searchId,
        type: 'photo',
        query: displayQuery,
        fileName,
        thumb,
        platforms,
        isSample: isSampleAsset,
        status: 'error',
        provider: 'backend',
        isDemo: false,
        results: [],
        error: e.message || 'Image search service is currently unavailable. Please try again.',
        timestamp: Date.now(),
      };
      setExecution(exec);
      throw e;
    }
    // Proceed to demo fallback if network offline (e.g. unit test mock)
  }

  // Demo Fallback (Offline Mode only)
  await new Promise(r => setTimeout(r, 200));

  if (!isSampleAsset) {
    // Arbitrary user photo upload: return empty result in demo mode rather than arbitrary fixtures
    const exec: SearchExecution = {
      id: searchId,
      type: 'photo',
      query: displayQuery,
      fileName,
      thumb,
      platforms,
      isSample: false,
      status: 'empty',
      provider: 'demo',
      isDemo: true,
      results: [],
      message: `No verified matches found for '${fileName}'. Live reverse-image searching requires a configured search provider.`,
      timestamp: Date.now(),
    };
    setExecution(exec);
    return exec;
  }

  // For sample demo images only, show generic demo examples clearly labeled as Demo Preview
  const sampleResults: DemoResult[] = DATA.filter(d => platforms.includes(d.platform)).map((d, i) => ({
    ...d,
    id: `demo_sample_${d.platform}_${i+1}`,
    match: 'Demo Preview' as MatchType,
    confidence: 0,
    isDemo: true,
    provider: 'demo',
    metadata: {
      evidence: `Generic demo illustration for sample image walkthrough. Not an actual match for '${fileName}'.`,
      verified: false,
    }
  }));
  saveToSession(sampleResults);

  const exec: SearchExecution = {
    id: searchId,
    type: 'photo',
    query: fileName,
    fileName,
    thumb,
    platforms,
    isSample: true,
    status: sampleResults.length > 0 ? 'ok' : 'empty',
    provider: 'demo',
    isDemo: true,
    results: sampleResults,
    message: `Showing generic demo preview for sample '${fileName}'.`,
    timestamp: Date.now(),
  };
  setExecution(exec);
  return exec;
}

export interface FetchResultsResponse {
  results: DemoResult[];
  isDemo: boolean;
  provider: string;
  message?: string;
}

/**
 * Reads from active SearchExecution if available and matching, or runs search once.
 */
export async function fetchResults(c: SearchContext): Promise<FetchResultsResponse> {
  const currentExec = getExecution();
  if (
    currentExec &&
    currentExec.type === c.type &&
    currentExec.query.trim().toLowerCase() === c.query.trim().toLowerCase() &&
    currentExec.platforms.slice().sort().join(',') === c.platforms.slice().sort().join(',')
  ) {
    if (currentExec.status === 'error') {
      throw new Error(currentExec.error || 'Search error');
    }
    return {
      results: currentExec.results,
      isDemo: currentExec.isDemo,
      provider: currentExec.provider,
      message: currentExec.message,
    };
  }

  // If no execution exists (e.g. direct URL entry or test), execute now:
  if (c.type === 'name') {
    const exec = await executeNameSearch(c.query, c.platforms);
    return {
      results: exec.results,
      isDemo: exec.isDemo,
      provider: exec.provider,
      message: exec.message,
    };
  } else {
    // For photo search without raw blob:
    const isSample = Boolean(
      c.isSample ||
      c.fileName?.toLowerCase().startsWith('sample-') ||
      c.query.toLowerCase().startsWith('sample-') ||
      c.fileName?.toLowerCase().includes('sample') ||
      c.query.toLowerCase().includes('sample')
    );
    if (!isSample) {
      const msg = `No verified matches found for '${c.fileName || c.query}'.`;
      setExecution({
        id: c.id,
        type: 'photo',
        query: c.query,
        fileName: c.fileName || c.query,
        thumb: c.thumb,
        platforms: c.platforms,
        isSample: false,
        status: 'empty',
        provider: 'demo',
        isDemo: true,
        results: [],
        message: msg,
        timestamp: Date.now(),
      });
      return {
        results: [],
        isDemo: true,
        provider: 'demo',
        message: msg,
      };
    }

    const sampleResults = DATA.filter(d => c.platforms.includes(d.platform)).map((d, i) => ({
      ...d,
      id: `demo_sample_${d.platform}_${i+1}`,
      match: 'Demo Preview' as MatchType,
      confidence: 0,
      isDemo: true,
      provider: 'demo',
      metadata: {
        evidence: `Generic demo illustration for sample walkthrough.`,
        verified: false,
      }
    }));
    saveToSession(sampleResults);
    setExecution({
      id: c.id,
      type: 'photo',
      query: c.query,
      fileName: c.fileName || c.query,
      thumb: c.thumb,
      platforms: c.platforms,
      isSample: true,
      status: sampleResults.length > 0 ? 'ok' : 'empty',
      provider: 'demo',
      isDemo: true,
      results: sampleResults,
      timestamp: Date.now(),
    });
    return {
      results: sampleResults,
      isDemo: true,
      provider: 'demo',
    };
  }
}
