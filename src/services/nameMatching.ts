import type { DemoResult } from './resultsService';

export interface CandidateIdentity {
  name: string | null;
  username: string | null;
  hasReliableIdentity: boolean;
}

export type MatchSection = 'exact' | 'similar' | 'other';

export interface ClassifiedResult {
  result: DemoResult;
  section: MatchSection;
  isExact: boolean;
  exactType: 'name' | 'username' | null;
  similarityScore: number | null;
  similarityType: 'name' | 'username' | null;
  similarityLabel: string;
}

/**
 * Normalizes text for comparison:
 * - Trims leading and trailing whitespace
 * - Converts to lowercase
 * - Strips leading '@' characters
 * - Collapses consecutive spaces into a single space
 */
export function normalizeText(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ');
}

/**
 * Computes standard Levenshtein edit distance between two strings with O(min(N, M)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Ensure 'b' is the shorter string to minimize array size
  if (a.length < b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  return dp[b.length];
}

/**
 * Deterministic text similarity percentage in range [0, 100].
 * Formula: round((1 - LevenshteinDistance(norm1, norm2) / max(len(norm1), len(norm2))) * 100)
 */
export function computeTextSimilarity(s1?: string | null, s2?: string | null): number {
  const norm1 = normalizeText(s1);
  const norm2 = normalizeText(s2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 100;

  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 0;

  const dist = levenshteinDistance(norm1, norm2);
  const similarity = (1 - dist / maxLen) * 100;
  return Math.max(0, Math.min(100, Math.round(similarity)));
}

/**
 * Safely extracts candidate name and username from provider fields, URLs, and metadata.
 */
export function extractResultIdentity(r: DemoResult | { user?: string; sourceUrl?: string | null; metadata?: Record<string, unknown>; platform?: string }): CandidateIdentity {
  let name: string | null = null;
  let username: string | null = null;

  const user = typeof r.user === 'string' ? r.user.trim() : '';

  if (user) {
    if (user.startsWith('@')) {
      username = user.replace(/^@+/, '').trim();
    } else {
      const handleMatch = user.match(/\(@([a-zA-Z0-9_.-]+)\)/);
      if (handleMatch) {
        if (!username) username = handleMatch[1].trim();
        name = user.replace(/\(@[a-zA-Z0-9_.-]+\)/, '').trim();
      } else {
        name = user;
      }
    }
  }

  // Extract handle from sourceUrl pathname if available
  if (r.sourceUrl && typeof r.sourceUrl === 'string') {
    try {
      const url = new URL(r.sourceUrl);
      const cleanPath = url.pathname.replace(/^\/+|\/+$/g, '');
      const segments = cleanPath.split('/').filter(Boolean);
      if (segments.length > 0) {
        const plat = r.platform || '';
        if (plat === 'tiktok') {
          const m = segments[0].match(/^@?([a-zA-Z0-9_.-]+)/);
          if (m && !username) username = m[1];
        } else if (plat === 'instagram') {
          const reserved = ['p', 'reel', 'stories', 'explore', 'direct', 'accounts'];
          if (!reserved.includes(segments[0].toLowerCase()) && !username) {
            username = segments[0];
          }
        } else if (plat === 'facebook') {
          const reserved = ['people', 'pages', 'watch', 'groups', 'share', 'events', 'photo.php'];
          if (!reserved.includes(segments[0].toLowerCase()) && !username) {
            username = segments[0];
          }
        } else if (plat === 'linkedin') {
          if (segments[0].toLowerCase() === 'in' && segments[1] && !username) {
            username = segments[1];
          }
        }
      }
    } catch {
      // Ignore URL parsing failure
    }
  }

  // Metadata overrides if present
  if (r.metadata) {
    if (!name && typeof r.metadata.name === 'string' && r.metadata.name.trim()) {
      name = r.metadata.name.trim();
    }
    if (!username && typeof r.metadata.username === 'string' && r.metadata.username.trim()) {
      username = r.metadata.username.replace(/^@+/, '').trim();
    }
  }

  const hasReliableIdentity = Boolean((name && name.length > 0) || (username && username.length > 0));

  return { name: name || null, username: username || null, hasReliableIdentity };
}

/**
 * Classifies a search result based on exact and similar name/username matching.
 *
 * Rules:
 * 1. Exact Match:
 *    - Normalized searched query strictly equals normalized result name or username.
 *    - Never treats partial matches as exact.
 *    - Requires reliable identity.
 *
 * 2. Similar Match:
 *    - Non-exact match with computed text similarity in [70, 90] inclusive.
 *    - Deterministic, based on searched name/username vs result's actual name/username.
 *
 * 3. Other:
 *    - Scores outside [70, 90] (e.g. < 70 or > 90 non-exact), or missing/unreliable identity.
 */
export function classifyResult(searchedQuery: string, result: DemoResult): ClassifiedResult {
  const normQuery = normalizeText(searchedQuery);
  const identity = extractResultIdentity(result);

  if (!normQuery || !identity.hasReliableIdentity) {
    return {
      result,
      section: 'other',
      isExact: false,
      exactType: null,
      similarityScore: null,
      similarityType: null,
      similarityLabel: 'Public result',
    };
  }

  const normName = normalizeText(identity.name);
  const normUsername = normalizeText(identity.username);

  // 1. Exact Name or Username Match (Strict full-string equality)
  if (normName && normQuery === normName) {
    return {
      result,
      section: 'exact',
      isExact: true,
      exactType: 'name',
      similarityScore: 100,
      similarityType: 'name',
      similarityLabel: 'Name similarity',
    };
  }

  if (normUsername && normQuery === normUsername) {
    return {
      result,
      section: 'exact',
      isExact: true,
      exactType: 'username',
      similarityScore: 100,
      similarityType: 'username',
      similarityLabel: 'Username similarity',
    };
  }

  // 2. Computed Text Similarity for Non-Exact Matches
  const nameSim = normName ? computeTextSimilarity(normQuery, normName) : 0;
  const userSim = normUsername ? computeTextSimilarity(normQuery, normUsername) : 0;

  let bestSim = 0;
  let bestType: 'name' | 'username' | null = null;

  if (userSim > nameSim) {
    bestSim = userSim;
    bestType = 'username';
  } else if (nameSim > 0) {
    bestSim = nameSim;
    bestType = 'name';
  } else if (userSim > 0) {
    bestSim = userSim;
    bestType = 'username';
  }

  // Similar section: genuine computed similarity from 70% through 90% inclusive
  if (bestSim >= 70 && bestSim <= 90) {
    return {
      result,
      section: 'similar',
      isExact: false,
      exactType: null,
      similarityScore: bestSim,
      similarityType: bestType,
      similarityLabel: bestType === 'username' ? 'Username similarity' : 'Name similarity',
    };
  }

  // Scores outside 70%-90% (e.g. < 70% or > 90% non-exact) belong to 'other'
  return {
    result,
    section: 'other',
    isExact: false,
    exactType: null,
    similarityScore: bestSim > 0 ? bestSim : null,
    similarityType: bestType,
    similarityLabel: bestSim > 0 ? (bestType === 'username' ? 'Username similarity' : 'Name similarity') : 'Public result',
  };
}

/**
 * Partitions a list of results into exact, similar, and other sections.
 */
export function partitionResults(
  searchedQuery: string,
  results: DemoResult[]
): {
  exact: ClassifiedResult[];
  similar: ClassifiedResult[];
  other: ClassifiedResult[];
} {
  const exact: ClassifiedResult[] = [];
  const similar: ClassifiedResult[] = [];
  const other: ClassifiedResult[] = [];

  for (const r of results) {
    const classified = classifyResult(searchedQuery, r);
    if (classified.section === 'exact') {
      exact.push(classified);
    } else if (classified.section === 'similar') {
      similar.push(classified);
    } else {
      other.push(classified);
    }
  }

  return { exact, similar, other };
}
