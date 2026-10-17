import type {PlatformId} from './photoSearchService';
import {executeNameSearch} from './resultsService';

export interface NameSearchRequest {
  query: string;
  platforms: PlatformId[];
}

export interface NameSearchResponse {
  status: 'demo' | 'live';
  isDemo: boolean;
  provider: string;
  message: string;
}

export async function submitNameSearch(req: NameSearchRequest): Promise<NameSearchResponse> {
  const exec = await executeNameSearch(req.query, req.platforms);
  return {
    status: exec.isDemo ? 'demo' : 'live',
    isDemo: exec.isDemo,
    provider: exec.provider,
    message: exec.message || (exec.status === 'empty' ? 'No matching results found.' : 'Search completed.'),
  };
}
