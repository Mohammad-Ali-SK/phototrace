import {api, PlatformId} from './api';
import {saveToSession, DemoResult, DATA} from './resultsService';

export type {PlatformId};

export interface PhotoSearchRequest {
  image: Blob;
  fileName: string;
  platforms: PlatformId[];
}

export interface PhotoSearchResponse {
  status: 'demo' | 'live';
  message: string;
}

export async function submitPhotoSearch(req: PhotoSearchRequest): Promise<PhotoSearchResponse> {
  try {
    const res = await api.searchPhoto(req.image, req.fileName, req.platforms);
    if (res && res.results) {
      const mapped: DemoResult[] = res.results.map((r, i) => ({
        id: r.id || `pr_${i}`,
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
        message: res.message || `Photo search completed across ${req.platforms.length} platform(s).`,
      };
    }
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 400 || e?.status === 413) {
      throw e;
    }
  }

  await new Promise(r => setTimeout(r, 400));
  return {
    status: 'demo',
    message: `Demo search prepared for "${req.fileName}" across ${req.platforms.length} platform(s).`,
  };
}
