import {api, PlatformId} from './api';
import {saveToSession, DemoResult, DATA} from './resultsService';

export interface NameSearchRequest {
  query: string;
  platforms: PlatformId[];
}

export interface NameSearchResponse {
  status: 'demo' | 'live';
  message: string;
}

export async function submitNameSearch(req: NameSearchRequest): Promise<NameSearchResponse> {
  try {
    const res = await api.searchName(req.query, req.platforms);
    if (res && res.results) {
      const mapped: DemoResult[] = res.results.map((r, i) => ({
        id: r.id || `nr_${i}`,
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
      return {
        status: res.isDemo ? 'demo' : 'live',
        message: res.message || `Name search completed across ${req.platforms.length} platform(s).`,
      };
    }
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 422 || e?.status === 400) {
      throw e;
    }
  }

  await new Promise(r => setTimeout(r, 400));
  return {
    status: 'demo',
    message: `Demo search prepared for "${req.query}" across ${req.platforms.length} platform(s).`,
  };
}
