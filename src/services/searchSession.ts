import type {PlatformId} from './photoSearchService';
import type {DemoResult} from './resultsService';

export interface SearchContext {
  id: string;
  type: 'photo' | 'name';
  query: string;
  fileName?: string;
  thumb?: string;
  platforms: PlatformId[];
  isSample?: boolean;
  isDemo?: boolean;
  provider?: string;
}

export interface SearchExecution extends SearchContext {
  status: 'idle' | 'loading' | 'ok' | 'error' | 'empty';
  provider: string;
  isDemo: boolean;
  results: DemoResult[];
  error?: string;
  message?: string;
  timestamp: number;
}

const K_CTX = 'pt_search_ctx';
const K_EXEC = 'pt_search_exec';
let memCtx: SearchContext | null = null;
let memExec: SearchExecution | null = null;

export const setContext = (c: SearchContext) => {
  memCtx = c;
  try {
    sessionStorage.setItem(K_CTX, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
};

export const getContext = (): SearchContext | null => {
  if (memCtx) return memCtx;
  try {
    const v = sessionStorage.getItem(K_CTX);
    return v ? (JSON.parse(v) as SearchContext) : null;
  } catch {
    return null;
  }
};

export const setExecution = (e: SearchExecution) => {
  memExec = e;
  memCtx = {
    id: e.id,
    type: e.type,
    query: e.query,
    fileName: e.fileName,
    thumb: e.thumb,
    platforms: e.platforms,
    isSample: e.isSample,
    isDemo: e.isDemo,
    provider: e.provider,
  };
  try {
    sessionStorage.setItem(K_EXEC, JSON.stringify(e));
    sessionStorage.setItem(K_CTX, JSON.stringify(memCtx));
  } catch {
    /* storage unavailable */
  }
};

export const getExecution = (): SearchExecution | null => {
  if (memExec) return memExec;
  try {
    const v = sessionStorage.getItem(K_EXEC);
    if (v) {
      memExec = JSON.parse(v) as SearchExecution;
      return memExec;
    }
  } catch {
    /* storage unavailable */
  }
  return null;
};

export const clearExecution = () => {
  memExec = null;
  memCtx = null;
  try {
    sessionStorage.removeItem(K_EXEC);
    sessionStorage.removeItem(K_CTX);
  } catch {
    /* storage unavailable */
  }
};

export const makeThumb = (blob: Blob) =>
  new Promise<string>((res) => {
    const timer = setTimeout(() => res('data:image/jpeg;base64,dummythumb'), 80);
    try {
      const u =
        typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(blob)
          : 'data:image/jpeg;base64,dummythumb';
      const im = new Image();
      im.onload = () => {
        clearTimeout(timer);
        try {
          const s = Math.min(1, 240 / Math.max(im.naturalWidth || 100, im.naturalHeight || 100));
          const c = document.createElement('canvas');
          c.width = Math.round((im.naturalWidth || 100) * s);
          c.height = Math.round((im.naturalHeight || 100) * s);
          c.getContext('2d')?.drawImage(im, 0, 0, c.width, c.height);
          if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(u);
          res(c.toDataURL('image/jpeg', 0.8));
        } catch {
          if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(u);
          res('data:image/jpeg;base64,dummythumb');
        }
      };
      im.onerror = () => {
        clearTimeout(timer);
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(u);
        res('');
      };
      im.src = u;
    } catch {
      clearTimeout(timer);
      res('');
    }
  });
