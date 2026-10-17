import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  levenshteinDistance,
  computeTextSimilarity,
  extractResultIdentity,
  classifyResult,
  partitionResults,
} from '../services/nameMatching';
import type { DemoResult } from '../services/resultsService';

describe('Name and Username Matching Service', () => {
  describe('normalizeText', () => {
    it('normalizes case and trims whitespace', () => {
      expect(normalizeText('  Taylor Swift  ')).toBe('taylor swift');
      expect(normalizeText('SARAH KHAN')).toBe('sarah khan');
      expect(normalizeText('John   Doe')).toBe('john doe');
    });

    it('strips leading @ from handles', () => {
      expect(normalizeText('@taylorswift')).toBe('taylorswift');
      expect(normalizeText('  @@sarah_diaries  ')).toBe('sarah_diaries');
    });

    it('handles empty, null, and non-string inputs safely', () => {
      expect(normalizeText('')).toBe('');
      expect(normalizeText(null)).toBe('');
      expect(normalizeText(undefined)).toBe('');
    });
  });

  describe('levenshteinDistance & computeTextSimilarity', () => {
    it('returns 0 distance and 100% similarity for identical strings', () => {
      expect(levenshteinDistance('taylor swift', 'taylor swift')).toBe(0);
      expect(computeTextSimilarity('taylor swift', 'taylor swift')).toBe(100);
      expect(computeTextSimilarity('@taylorswift', 'taylorswift')).toBe(100);
    });

    it('computes expected distances and similarity scores', () => {
      // "sarah khan" (10 chars) vs "sarah k" (7 chars) -> 3 edits -> 70%
      expect(computeTextSimilarity('sarah khan', 'sarah k')).toBe(70);

      // "sarah khan" (10 chars) vs "sara khan" (9 chars) -> 1 edit -> 90%
      expect(computeTextSimilarity('sarah khan', 'sara khan')).toBe(90);

      // "taylorswift" (11 chars) vs "taylor_swift" (12 chars) -> 1 edit -> 92%
      expect(computeTextSimilarity('taylorswift', 'taylor_swift')).toBe(92);

      // "taylorswift" (11 chars) vs "taylorswift13" (13 chars) -> 2 edits -> 85%
      expect(computeTextSimilarity('taylorswift', 'taylorswift13')).toBe(85);
    });

    it('handles completely disjoint strings and empty strings', () => {
      expect(computeTextSimilarity('alice', 'bob')).toBe(0);
      expect(computeTextSimilarity('', 'test')).toBe(0);
    });
  });

  describe('extractResultIdentity', () => {
    it('extracts name and handle from user string', () => {
      const id1 = extractResultIdentity({ user: 'Taylor Swift' });
      expect(id1.name).toBe('Taylor Swift');
      expect(id1.username).toBeNull();
      expect(id1.hasReliableIdentity).toBe(true);

      const id2 = extractResultIdentity({ user: '@taylorswift' });
      expect(id2.name).toBeNull();
      expect(id2.username).toBe('taylorswift');
      expect(id2.hasReliableIdentity).toBe(true);
    });

    it('extracts username from platform sourceUrl', () => {
      const idIg = extractResultIdentity({
        user: 'Taylor Swift',
        sourceUrl: 'https://instagram.com/taylorswift',
        platform: 'instagram',
      });
      expect(idIg.name).toBe('Taylor Swift');
      expect(idIg.username).toBe('taylorswift');

      const idTt = extractResultIdentity({
        user: 'Sarah',
        sourceUrl: 'https://www.tiktok.com/@sarah_diaries',
        platform: 'tiktok',
      });
      expect(idTt.username).toBe('sarah_diaries');

      const idLi = extractResultIdentity({
        user: 'Sarah Khan – Software Engineer',
        sourceUrl: 'https://www.linkedin.com/in/sarah-khan-dev/',
        platform: 'linkedin',
      });
      expect(idLi.name).toBe('Sarah Khan – Software Engineer');
      expect(idLi.username).toBe('sarah-khan-dev');
    });

    it('flags results with missing or empty identity as unreliable', () => {
      const empty = extractResultIdentity({ user: '', sourceUrl: null });
      expect(empty.hasReliableIdentity).toBe(false);
      expect(empty.name).toBeNull();
      expect(empty.username).toBeNull();
    });
  });

  describe('classifyResult and partitionResults', () => {
    const makeRes = (user: string, sourceUrl: string | null = null, platform: any = 'instagram'): DemoResult => ({
      id: `res_${Math.random()}`,
      platform,
      user,
      caption: 'Test caption',
      date: '2026-01-01',
      match: 'Name Match',
      confidence: 0,
      img: '',
      sourceUrl,
    });

    it('Exact case-insensitive name match enters Exact section', () => {
      const res = makeRes('Sarah Khan', 'https://facebook.com/sarahkhan', 'facebook');
      const c = classifyResult('sarah khan', res);
      expect(c.section).toBe('exact');
      expect(c.isExact).toBe(true);
      expect(c.exactType).toBe('name');
      expect(c.similarityScore).toBe(100);
      expect(c.similarityLabel).toBe('Name similarity');
    });

    it('Exact case-insensitive username match enters Exact section', () => {
      const res = makeRes('@sarahofficial', 'https://instagram.com/sarahofficial', 'instagram');
      const c = classifyResult('sarahofficial', res);
      expect(c.section).toBe('exact');
      expect(c.isExact).toBe(true);
      expect(c.exactType).toBe('username');
      expect(c.similarityScore).toBe(100);
      expect(c.similarityLabel).toBe('Username similarity');
    });

    it('Partial matches NEVER enter the Exact section', () => {
      // Substring: "sarah" vs "sarah khan"
      const res1 = makeRes('Sarah Khan');
      const c1 = classifyResult('sarah', res1);
      expect(c1.section).not.toBe('exact');
      expect(c1.isExact).toBe(false);

      // Superstring: "sarah khan" vs "sarah khan software engineer"
      const res2 = makeRes('Sarah Khan Software Engineer');
      const c2 = classifyResult('sarah khan', res2);
      expect(c2.section).not.toBe('exact');
      expect(c2.isExact).toBe(false);
    });

    it('Similarity scores from 70% to 90% appear only in Similar section', () => {
      // "sarah khan" vs "sarah k" -> 70%
      const res70 = makeRes('Sarah K');
      const c70 = classifyResult('sarah khan', res70);
      expect(c70.similarityScore).toBe(70);
      expect(c70.section).toBe('similar');

      // "sarah khan" vs "sara khan" -> 90%
      const res90 = makeRes('Sara Khan');
      const c90 = classifyResult('sarah khan', res90);
      expect(c90.similarityScore).toBe(90);
      expect(c90.section).toBe('similar');
    });

    it('Scores outside 70% to 90% do not enter either Exact or Similar', () => {
      // 50% match (< 70%)
      const res50 = makeRes('Sarah');
      const c50 = classifyResult('sarah khan', res50);
      expect(c50.section).toBe('other');
      expect(c50.section).not.toBe('exact');
      expect(c50.section).not.toBe('similar');

      // 92% non-exact match (> 90%)
      const res92 = makeRes('taylor_swift');
      const c92 = classifyResult('taylorswift', res92);
      expect(c92.similarityScore).toBe(92);
      expect(c92.isExact).toBe(false);
      expect(c92.section).toBe('other');
    });

    it('Missing or empty name/username handled safely and excluded from exact/similar', () => {
      const resEmpty = makeRes('');
      const c = classifyResult('sarah khan', resEmpty);
      expect(c.section).toBe('other');
      expect(c.isExact).toBe(false);
      expect(c.similarityScore).toBeNull();
      expect(c.similarityLabel).toBe('Public result');
    });

    it('partitionResults groups items into exact, similar, and other', () => {
      const items: DemoResult[] = [
        makeRes('Sarah Khan'), // Exact 100%
        makeRes('Sara Khan'),  // Similar 90%
        makeRes('Sarah K'),    // Similar 70%
        makeRes('Random User'),// Other (< 70%)
      ];

      const partitioned = partitionResults('sarah khan', items);
      expect(partitioned.exact.length).toBe(1);
      expect(partitioned.exact[0].result.user).toBe('Sarah Khan');

      expect(partitioned.similar.length).toBe(2);
      expect(partitioned.similar.map(s => s.result.user)).toEqual(['Sara Khan', 'Sarah K']);

      expect(partitioned.other.length).toBe(1);
      expect(partitioned.other[0].result.user).toBe('Random User');
    });
  });
});
