import {executePhotoSearch} from './resultsService';
import type {PlatformId} from '../services/api';

export type {PlatformId};

export interface PhotoSearchRequest {
  image: Blob;
  fileName: string;
  platforms: PlatformId[];
  thumb?: string;
  isSample?: boolean;
  name?: string;
}

export interface PhotoSearchResponse {
  status: 'demo' | 'live';
  isDemo: boolean;
  provider: string;
  message: string;
}

export async function submitPhotoSearch(req: PhotoSearchRequest): Promise<PhotoSearchResponse> {
  const exec = await executePhotoSearch(req.image, req.fileName, req.platforms, req.thumb, req.isSample, req.name);
  return {
    status: exec.isDemo ? 'demo' : 'live',
    isDemo: exec.isDemo,
    provider: exec.provider,
    message: exec.message || (exec.status === 'empty' ? 'No matching results found.' : 'Search completed.'),
  };
}
