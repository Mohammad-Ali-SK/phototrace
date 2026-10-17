export type KnownPlatformId = 'instagram' | 'facebook' | 'tiktok' | 'linkedin';
export type PlatformId = KnownPlatformId | 'other';

export const KNOWN_PLATFORMS: KnownPlatformId[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];

export const PLATFORM_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  other: 'Other',
  unknown: 'Other',
};

/**
 * Normalizes platform identity strictly from a verified result URL hostname/path.
 *
 * Rules:
 * - instagram.com -> 'instagram'
 * - facebook.com -> 'facebook'
 * - tiktok.com -> 'tiktok'
 * - linkedin.com -> 'linkedin'
 * - Otherwise (or if invalid/empty) -> 'other'
 */
export function normalizePlatformFromUrl(url?: string | null): PlatformId {
  if (!url || typeof url !== 'string') return 'other';
  try {
    const trimmed = url.trim();
    if (!trimmed) return 'other';
    const toParse = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(toParse);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }

    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
      return 'instagram';
    }
    if (host === 'facebook.com' || host === 'fb.com' || host.endsWith('.facebook.com') || host.endsWith('.fb.com')) {
      return 'facebook';
    }
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      return 'tiktok';
    }
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
      return 'linkedin';
    }
  } catch {
    // Malformed URL
  }
  return 'other';
}

/**
 * Resolves the authoritative platform for a search result item.
 *
 * Requirements:
 * 1. Prefer the verified source URL for platform identity. Do not infer platform
 *    solely from title, search query, favicon, or array position.
 * 2. If the source URL points to an unverified or unknown domain, label it 'other'.
 * 3. In demo fixtures without sourceUrl, fall back to declared platform if known, else 'other'.
 */
export function resolveResultPlatform(item: {
  platform?: string;
  sourceUrl?: string | null;
  isDemo?: boolean;
}): PlatformId {
  // If sourceUrl is present, prefer it authoritatively
  if (item.sourceUrl && typeof item.sourceUrl === 'string' && item.sourceUrl.trim()) {
    const fromUrl = normalizePlatformFromUrl(item.sourceUrl);
    if (fromUrl !== 'other') {
      return fromUrl;
    }
    return 'other';
  }

  // Demo fixtures might not have sourceUrl
  if (item.isDemo && item.platform && KNOWN_PLATFORMS.includes(item.platform as KnownPlatformId)) {
    return item.platform as KnownPlatformId;
  }

  if (item.platform && KNOWN_PLATFORMS.includes(item.platform as KnownPlatformId)) {
    return item.platform as KnownPlatformId;
  }

  return 'other';
}

/**
 * Deduplicates results by canonical source URL (or ID if no URL).
 * Ensures All Results equals the count of unique results in the active result set.
 */
export function deduplicateResults<T extends { id?: string; sourceUrl?: string | null }>(results: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const r of results) {
    const rawUrl = (r.sourceUrl || '').trim().toLowerCase().replace(/\/+$/, '');
    const key = rawUrl ? `url:${rawUrl}` : `id:${r.id || Math.random()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  return unique;
}
