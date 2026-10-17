import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useStore } from '../services/historyService';
import { Link } from 'react-router-dom';
import {
  Search, RefreshCw, ChevronDown, Image as ImgIcon, User, Info,
  AlertTriangle, SearchX, ExternalLink, Sparkles, Heart, Globe, ShieldCheck
} from 'lucide-react';
import { Shell, PL } from '../home/Home';
import { getContext, setContext, getExecution, SearchContext } from '../services/searchSession';
import { fetchResults, DemoResult, MatchType } from '../services/resultsService';
import type { PlatformId } from '../services/photoSearchService';
import {
  partitionResults,
  ClassifiedResult,
} from '../services/nameMatching';

const PN: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  other: 'Other',
  unknown: 'Other',
};

const ORDER: PlatformId[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];

const platformRank = (p?: string): number => {
  const idx = ORDER.indexOf(p as PlatformId);
  return idx === -1 ? 999 : idx;
};

const MC: Record<MatchType, string> = {
  'Exact Image Match': 'bg-emerald-100 text-emerald-700',
  'Similar Image': 'bg-indigo-100 text-indigo-700',
  'Name Match': 'bg-amber-100 text-amber-800',
  'Demo Preview': 'bg-violet-100 text-violet-700',
};

type Filter = 'all' | PlatformId;
type Sort = 'best' | 'recent' | 'platform';

const fd = (d: string) =>
  new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const Skel = () => (
  <div className="animate-pulse overflow-hidden rounded-2xl border bg-white">
    <div className="h-44 bg-slate-200" />
    <div className="space-y-3 p-4">
      <div className="h-4 w-1/2 rounded bg-slate-200" />
      <div className="h-3 w-3/4 rounded bg-slate-200" />
      <div className="h-3 w-1/3 rounded bg-slate-200" />
      <div className="h-10 rounded-lg bg-slate-200" />
    </div>
  </div>
);

export function getInitials(name: string): string {
  if (!name) return '?';
  const clean = name.replace(/^[@#]/, '').trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return clean.slice(0, 2).toUpperCase() || '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const PLAT_STYLE: Record<string, { bg: string; text: string }> = {
  tiktok: { bg: 'from-slate-900 via-slate-800 to-cyan-950', text: 'text-cyan-400' },
  instagram: { bg: 'from-amber-500/15 via-rose-500/15 to-purple-600/15', text: 'text-rose-600' },
  facebook: { bg: 'from-blue-600/15 to-indigo-600/15', text: 'text-blue-700' },
  linkedin: { bg: 'from-sky-600/15 to-blue-700/15', text: 'text-sky-800' },
  other: { bg: 'from-slate-100 to-slate-200', text: 'text-slate-600' },
  unknown: { bg: 'from-slate-100 to-slate-200', text: 'text-slate-600' },
};

function CardAvatar({ r }: { r: DemoResult }) {
  const [err, setErr] = useState(false);
  if (r.img && !err) {
    return (
      <img
        src={r.img}
        alt={`Profile preview for ${r.user}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setErr(true)}
        className="h-44 w-full object-cover"
      />
    );
  }
  const style = PLAT_STYLE[r.platform] || PLAT_STYLE.other;
  const platformLabel = PN[r.platform] || 'Other';
  return (
    <div data-testid={`avatar-fallback-${r.platform}`} className={`flex h-44 w-full flex-col items-center justify-center bg-gradient-to-br ${style.bg} p-4 text-center select-none`}>
      <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm text-lg font-bold tracking-wider ${style.text}`}>
        {getInitials(r.user)}
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{r.user}</p>
      <p className="text-[11px] text-slate-500">Public {platformLabel} source</p>
    </div>
  );
}

function Card({
  r,
  classified,
  saved,
  onSave,
}: {
  r: DemoResult;
  classified?: ClassifiedResult;
  saved: boolean;
  onSave: () => void;
}) {
  const score = classified?.similarityScore ?? (r.confidence > 0 ? r.confidence : null);
  const simType = classified?.similarityType;
  const simLabel = classified?.similarityLabel || (simType === 'username' ? 'Username similarity' : 'Name similarity');

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl hover:shadow-violet-200/50">
      <div className="relative">
        <CardAvatar r={r} />
        <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/60 py-1 pl-1 pr-2 text-xs font-semibold text-white backdrop-blur">
          <PL p={r.platform} s={22} />
          {PN[r.platform]}
        </span>
        <button
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${r.user} from saved results` : `Save ${r.user}`}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow transition hover:scale-105"
        >
          <Heart size={18} className={saved ? 'fill-rose-500 text-rose-500' : 'text-slate-600'} />
        </button>
        <span className={`absolute bottom-2 left-2 rounded px-2 py-0.5 text-[11px] font-semibold text-white ${r.isDemo ? 'bg-violet-600' : 'bg-emerald-600'}`}>
          {r.isDemo ? 'Demo Result' : 'Public Source'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${MC[r.match] || 'bg-amber-100 text-amber-800'}`}>
            {r.match}
          </span>
          {score !== null && score > 0 ? (
            <span
              title={r.isDemo ? 'Computed text similarity on demo item. Text similarity does not confirm real-world identity.' : 'Computed text similarity. Text similarity does not confirm real-world identity.'}
              className="text-xs text-slate-500"
            >
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                {score}%
              </span>
              <span className="ml-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {simLabel}
              </span>
              {r.isDemo && (
                <span className="ml-1 text-[11px] italic text-slate-400">(illustrative)</span>
              )}
            </span>
          ) : (
            <span className="text-xs font-medium text-slate-500">Public result</span>
          )}
        </div>

        <p className="truncate font-semibold">{r.user}</p>
        <p className="line-clamp-2 text-sm text-slate-600">{r.caption}</p>
        <p className="text-xs text-slate-400">
          {r.isDemo ? `Illustrative date: ${fd(r.date)}` : (r.date ? `Date: ${fd(r.date)}` : 'Public source')}
        </p>

        <div className="mt-auto space-y-2 pt-2">
          <Link to={`/details/${r.id}`} className="btn grad-anim w-full !rounded-xl">
            View Details <Info size={14} />
          </Link>
          {r.sourceUrl ? (
            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn grad-anim w-full !rounded-xl">
              View Original Page <ExternalLink size={14} />
            </a>
          ) : (
            <button disabled title="Demo content has no real source page" className="btn w-full !rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
              Preview only – no source link
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ResultsPage() {
  const [ctx, setCtx] = useState<SearchContext | null>(getContext);
  const [st, setSt] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [data, setData] = useState<DemoResult[]>([]);
  const [execMeta, setExecMeta] = useState<{ isDemo: boolean; provider: string }>(() => {
    const e = getExecution();
    if (e) return { isDemo: e.isDemo, provider: e.provider };
    const c = getContext();
    return { isDemo: c?.isDemo ?? true, provider: c?.provider ?? 'demo' };
  });

  const [f, setF] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('platform');
  const [tick, setTick] = useState(0);
  const [menu, setMenu] = useState(false);
  const [showBroader, setShowBroader] = useState(false);
  const store = useStore();
  const { loading: authLoading } = useAuth();
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [saveMsg, setSaveMsg] = useState('');
  const logged = useRef('');

  useEffect(() => {
    if (authLoading) return;
    store.listSaved().then(l => setKeys(new Set(l.map(x => x.resultKey)))).catch(() => setKeys(new Set()));
  }, [store, authLoading]);

  useEffect(() => {
    if (!ctx || authLoading || st === 'loading' || logged.current === ctx.id) return;
    logged.current = ctx.id;
    void store.addHistory({
      type: ctx.type,
      query: ctx.type === 'photo' ? (ctx.fileName || ctx.query) : ctx.query,
      thumb: ctx.type === 'photo' ? ctx.thumb || null : null,
      platforms: ctx.platforms,
      resultCount: data.length,
      status: st === 'error' ? 'failed' : data.length ? 'completed' : 'empty'
    }).catch(() => setSaveMsg('Could not record this search in your history.'));
  }, [st, ctx, authLoading, store, data.length]);

  const toggleSave = async (r: DemoResult) => {
    const was = keys.has(r.id);
    const n = new Set(keys);
    if (was) n.delete(r.id); else n.add(r.id);
    setKeys(n);
    setSaveMsg('');
    try {
      if (was) {
        await store.removeSaved(r.id);
        setSaveMsg('Removed from saved results.');
      } else {
        await store.addSaved({
          resultKey: r.id,
          platform: r.platform,
          account: r.user,
          caption: r.caption,
          matchType: r.match,
          sourceUrl: r.sourceUrl
        });
        setSaveMsg('Saved. View it in Search History → Saved Results.');
      }
    } catch {
      setKeys(keys);
      setSaveMsg('Could not update saved results. Please try again.');
    }
  };

  useEffect(() => {
    if (!ctx) return;
    let on = true;
    setSt('loading');
    setF('all');
    setErrMsg('');
    fetchResults(ctx).then(r => {
      if (on) {
        setData(r.results);
        setExecMeta({ isDemo: r.isDemo, provider: r.provider });
        setSt('ok');
      }
    }).catch((e) => {
      if (on) {
        setErrMsg(e?.message || 'The search request failed.');
        setSt('error');
      }
    });
    return () => { on = false; };
  }, [ctx, tick]);

  const count = (p: Filter) => p === 'all' ? data.length : data.filter(d => d.platform === p).length;

  const filtered = useMemo(() => data.filter(d => f === 'all' || d.platform === f), [data, f]);

  const { exact, similar, other } = useMemo(() => {
    if (!ctx || ctx.type !== 'name') {
      return { exact: [], similar: [], other: [] };
    }
    return partitionResults(ctx.query || '', filtered);
  }, [ctx, filtered]);

  const sortClassifiedList = (list: ClassifiedResult[], mode: Sort): ClassifiedResult[] => {
    return [...list].sort((a, b) => {
      if (mode === 'best') {
        const diff = (b.similarityScore ?? b.result.confidence ?? 0) - (a.similarityScore ?? a.result.confidence ?? 0);
        if (diff !== 0) return diff;
        return platformRank(a.result.platform) - platformRank(b.result.platform);
      }
      if (mode === 'recent') {
        const dateDiff = b.result.date.localeCompare(a.result.date);
        if (dateDiff !== 0) return dateDiff;
        return platformRank(a.result.platform) - platformRank(b.result.platform) || (b.similarityScore || 0) - (a.similarityScore || 0);
      }
      // 'platform' priority
      const platDiff = platformRank(a.result.platform) - platformRank(b.result.platform);
      if (platDiff !== 0) return platDiff;
      return (b.similarityScore ?? b.result.confidence ?? 0) - (a.similarityScore ?? a.result.confidence ?? 0);
    });
  };

  const sortGeneralList = (list: DemoResult[], mode: Sort): DemoResult[] => {
    return [...list].sort((a, b) => {
      if (mode === 'best') {
        const diff = (b.confidence || 0) - (a.confidence || 0);
        if (diff !== 0) return diff;
        return platformRank(a.platform) - platformRank(b.platform);
      }
      if (mode === 'recent') {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) return dateDiff;
        return platformRank(a.platform) - platformRank(b.platform) || (b.confidence || 0) - (a.confidence || 0);
      }
      const platDiff = platformRank(a.platform) - platformRank(b.platform);
      if (platDiff !== 0) return platDiff;
      return (b.confidence || 0) - (a.confidence || 0);
    });
  };

  const { exactPhoto, similarPhoto, namePhoto, otherPhoto } = useMemo(() => {
    if (!ctx || ctx.type !== 'photo') {
      return { exactPhoto: [], similarPhoto: [], namePhoto: [], otherPhoto: [] };
    }
    const exactMatches = filtered.filter(r => r.match === 'Exact Image Match');
    const similarMatches = filtered.filter(r => r.match === 'Similar Image');
    const nameMatches = filtered.filter(r => r.match === 'Name Match');
    const otherMatches = filtered.filter(
      r => r.match !== 'Exact Image Match' && r.match !== 'Similar Image' && r.match !== 'Name Match'
    );
    return { exactPhoto: exactMatches, similarPhoto: similarMatches, namePhoto: nameMatches, otherPhoto: otherMatches };
  }, [ctx, filtered]);

  const sortedExact = useMemo(() => sortClassifiedList(exact, sort), [exact, sort]);
  const sortedSimilar = useMemo(() => sortClassifiedList(similar, sort), [similar, sort]);
  const sortedOther = useMemo(() => sortClassifiedList(other, sort), [other, sort]);
  const sortedExactPhoto = useMemo(() => sortGeneralList(exactPhoto, sort), [exactPhoto, sort]);
  const sortedSimilarPhoto = useMemo(() => sortGeneralList(similarPhoto, sort), [similarPhoto, sort]);
  const sortedNamePhoto = useMemo(() => sortGeneralList(namePhoto, sort), [namePhoto, sort]);
  const sortedOtherPhoto = useMemo(() => sortGeneralList(otherPhoto, sort), [otherPhoto, sort]);
  const sortedPhoto = useMemo(() => sortGeneralList(filtered, sort), [filtered, sort]);

  const back = ctx?.type === 'name' ? '/search/name' : '/search/photo';
  const sample = () => {
    const c: SearchContext = { id: String(Date.now()), type: 'name', query: 'sample search', platforms: ORDER, isDemo: true, provider: 'demo' };
    setContext(c);
    setCtx(c);
    setExecMeta({ isDemo: true, provider: 'demo' });
  };
  const tabs: [Filter, string][] = [
    ['all', 'All Results'],
    ...ORDER.map(p => [p, PN[p]] as [Filter, string]),
    ...(data.some(d => d.platform === 'other') ? [['other', 'Other'] as [Filter, string]] : []),
  ];

  return (
    <Shell>
      {() => (
        <>
          <section className="relative overflow-hidden bg-[#050a2e] text-white">
            <div aria-hidden className="glow left-[-10%] top-[-40%] bg-blue-600/30" />
            <div aria-hidden className="glow glow-b right-[-10%] top-[-20%] bg-fuchsia-600/25" />
            <div className="enter relative mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-10">
              {execMeta.isDemo ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs">
                  <Sparkles size={12} />
                  Demo preview
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  <Globe size={12} />
                  Public web results
                </span>
              )}
              <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Search Results</h1>
              {ctx && (
                <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur">
                  {ctx.type === 'photo' && ctx.thumb && (
                    <img src={ctx.thumb} alt="Your selected image" className="h-16 w-16 rounded-xl object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs text-slate-300">
                      {ctx.type === 'photo' ? <ImgIcon size={14} /> : <User size={14} />}
                      {ctx.type === 'photo' ? 'Photo Search' : 'Name Search'}
                    </p>
                    <p className="truncate font-semibold">{ctx.type === 'photo' ? ctx.fileName || 'Selected image' : `“${ctx.query}”`}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                      {ctx.platforms.map(p => <PL key={p} p={p} s={20} />)}
                      <span>
                        {st === 'ok'
                          ? (execMeta.isDemo
                            ? `${data.length} demo result${data.length === 1 ? '' : 's'}`
                            : `${data.length} public result${data.length === 1 ? '' : 's'}`)
                          : '…'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <button className="btn grad-anim !rounded-xl" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                        New Search<ChevronDown size={14} />
                      </button>
                      {menu && (
                        <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl bg-white text-sm text-slate-900 shadow-xl">
                          <Link to="/search/photo" className="block px-4 py-3 hover:bg-violet-50">Photo Search</Link>
                          <Link to="/search/name" className="block px-4 py-3 hover:bg-violet-50">Name Search</Link>
                        </div>
                      )}
                    </div>
                    <Link to={back} className="btn !rounded-xl border border-white/40 text-white hover:bg-white/10">
                      <Search size={14} />Search Again
                    </Link>
                    <button
                      className="btn !rounded-xl border border-white/40 text-white hover:bg-white/10"
                      disabled={st === 'loading'}
                      onClick={() => setTick(tick + 1)}
                    >
                      <RefreshCw size={14} className={st === 'loading' ? 'animate-spin' : ''} />
                      {execMeta.isDemo ? 'Rerun demo' : 'Rerun search'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="bg-[#f6f4ff] dark:bg-[#0a0f33]">
            <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
              {!ctx ? (
                <div className="enter mx-auto max-w-lg rounded-2xl border border-violet-100 bg-white p-10 text-center shadow-sm">
                  <SearchX className="mx-auto text-violet-400" size={40} />
                  <h2 className="mt-3 text-xl font-bold">No search to show</h2>
                  <p className="mt-1 text-sm text-slate-500">Start a Photo Search or Name Search first, then your demo results will appear here.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Link to="/search/photo" className="btn grad-anim !rounded-xl">Photo Search</Link>
                    <Link to="/search/name" className="btn !rounded-xl border border-violet-300 bg-white !text-violet-700">Name Search</Link>
                  </div>
                  <button className="mt-4 text-sm text-violet-600 underline" onClick={sample}>View sample demo results</button>
                </div>
              ) : (
                <>
                  {execMeta.isDemo ? (
                    <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <Info className="mt-0.5 shrink-0" size={18} />
                      <p>
                        <b>Demo results.</b> These are sample examples, not real discoveries. No platform or live internet source was searched. Real image and name searches need a backend and authorized search sources. Confidence values are illustrative.
                      </p>
                    </div>
                  ) : (
                    <div role="note" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-200">
                      <ShieldCheck className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" size={18} />
                      <p>
                        <b>Public web search results.</b> Sourced from indexed public profiles and pages across selected platforms via {execMeta.provider === 'serpapi' ? 'SerpApi' : execMeta.provider || 'live search'}. Only public information is indexed. Always verify user identities directly on the source platform.
                      </p>
                    </div>
                  )}

                  <div role="status" aria-live="polite" className="text-sm text-slate-600">
                    {saveMsg}{saveMsg.startsWith('Saved') && <> <Link to="/history?tab=saved" className="font-medium text-violet-600 underline">Open saved results</Link></>}
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div role="tablist" aria-label="Filter by platform" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      {tabs.map(([k, l]) => (
                        <button
                          key={k}
                          role="tab"
                          aria-selected={f === k}
                          onClick={() => setF(k)}
                          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${f === k ? 'border-violet-600 bg-violet-600 text-white shadow' : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300'}`}
                        >
                          {l}
                          <span className={`rounded-full px-1.5 text-xs ${f === k ? 'bg-white/25' : 'bg-slate-100'}`}>
                            {st === 'ok' ? count(k) : '–'}
                          </span>
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      Sort by
                      <select
                        value={sort}
                        onChange={e => setSort(e.target.value as Sort)}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-200"
                      >
                        <option value="platform">Platform Priority</option>
                        <option value="best">Best Match</option>
                        <option value="recent">Most Recent</option>
                      </select>
                    </label>
                  </div>

                  {st === 'loading' && (
                    <div>
                      <p role="status" className="mb-3 text-sm text-slate-500">
                        {execMeta.isDemo ? 'Loading demo results…' : 'Loading public web results…'}
                      </p>
                      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {[1, 2, 3, 4].map(i => <Skel key={i} />)}
                      </div>
                    </div>
                  )}

                  {st === 'error' && (
                    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-10 text-center">
                      <AlertTriangle className="mx-auto text-red-500" size={36} />
                      <h2 className="mt-3 text-lg font-bold">Something went wrong</h2>
                      <p className="text-sm text-slate-600">{errMsg || 'The search request failed. Please try again.'}</p>
                      <button className="btn grad-anim mt-4 !rounded-xl" onClick={() => setTick(tick + 1)}>Retry</button>
                    </div>
                  )}

                  {st === 'ok' && (
                    ctx.type === 'name' ? (
                      filtered.length > 0 ? (
                        <div className="space-y-8 enter">
                          {/* Section A: Exact Name / Username Matches */}
                          <section aria-labelledby="exact-matches-heading" className="space-y-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
                              <div>
                                <h2 id="exact-matches-heading" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                  <span>Exact Name / Username Matches</span>
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                    {sortedExact.length}
                                  </span>
                                </h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  Results where the normalized searched name or username exactly matches the public profile name or handle. Exact text match does not confirm real-world identity.
                                </p>
                              </div>
                            </div>
                            {sortedExact.length > 0 ? (
                              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {sortedExact.map(c => (
                                  <Card
                                    key={c.result.id}
                                    r={c.result}
                                    classified={c}
                                    saved={keys.has(c.result.id)}
                                    onSave={() => void toggleSave(c.result)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                                No exact name or username matches found across selected platforms.
                              </div>
                            )}
                          </section>

                          {/* Section B: Similar Name / Username Matches */}
                          <section aria-labelledby="similar-matches-heading" className="space-y-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
                              <div>
                                <h2 id="similar-matches-heading" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                  <span>Similar Name / Username Matches</span>
                                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                                    {sortedSimilar.length}
                                  </span>
                                </h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  Results with genuine computed text similarity from 70% through 90% (inclusive). Text similarity indicates typographic resemblance and does not confirm real-world identity.
                                </p>
                              </div>
                            </div>
                            {sortedSimilar.length > 0 ? (
                              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {sortedSimilar.map(c => (
                                  <Card
                                    key={c.result.id}
                                    r={c.result}
                                    classified={c}
                                    saved={keys.has(c.result.id)}
                                    onSave={() => void toggleSave(c.result)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                                No similar matches (70%–90%) found across selected platforms.
                              </div>
                            )}
                          </section>

                          {/* Broader & Unclassified Results */}
                          {sortedOther.length > 0 && (
                            <section aria-labelledby="other-matches-heading" className="space-y-4 border-t border-slate-200/60 pt-4 dark:border-slate-700/60">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <h3 id="other-matches-heading" className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
                                    <span>Broader &amp; Unclassified Results</span>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                      {sortedOther.length}
                                    </span>
                                  </h3>
                                  <p className="text-xs text-slate-500">
                                    Results with text similarity outside the 70%–90% range or lacking verified profile names.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowBroader(!showBroader)}
                                  className="btn !rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                  {showBroader ? `Hide broader results (${sortedOther.length})` : `Show broader results (${sortedOther.length})`}
                                </button>
                              </div>

                              {showBroader && (
                                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pt-2">
                                  {sortedOther.map(c => (
                                    <Card
                                      key={c.result.id}
                                      r={c.result}
                                      classified={c}
                                      saved={keys.has(c.result.id)}
                                      onSave={() => void toggleSave(c.result)}
                                    />
                                  ))}
                                </div>
                              )}
                            </section>
                          )}
                        </div>
                      ) : (
                        <div className="enter mx-auto max-w-lg rounded-2xl border border-dashed border-violet-200 bg-white p-8 text-center sm:p-10">
                          <SearchX className="mx-auto text-violet-400" size={40} />
                          {execMeta.isDemo ? (
                            <>
                              <h2 className="mt-3 text-lg font-bold">No matching demo content</h2>
                              <p className="mt-1 text-sm text-slate-500">
                                {f !== 'all' && !ctx.platforms.includes(f)
                                  ? `${PN[f]} was not selected for this search.`
                                  : 'There are no demo results for this search or filter.'}
                              </p>
                              <div className="mt-5 flex flex-wrap justify-center gap-3">
                                {f !== 'all' && (
                                  <button className="btn !rounded-xl border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50" onClick={() => setF('all')}>
                                    Show all results
                                  </button>
                                )}
                                <Link to={back} className="btn grad-anim !rounded-xl">Start a New Search</Link>
                              </div>
                            </>
                          ) : (
                            <>
                              <h2 className="mt-3 text-lg font-bold">No public results found</h2>
                              <p className="mt-1 text-sm text-slate-500">
                                {f !== 'all' && !ctx.platforms.includes(f)
                                  ? `${PN[f]} was not selected for this search.`
                                  : `No public results found for “${ctx.query}” across selected platforms.`}
                              </p>
                              <div className="mt-5 flex flex-wrap justify-center gap-3">
                                {f !== 'all' && (
                                  <button className="btn !rounded-xl border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50" onClick={() => setF('all')}>
                                    Show all results
                                  </button>
                                )}
                                <Link to={back} className="btn grad-anim !rounded-xl">Start a New Search</Link>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    ) : (
                      /* Photo search */
                      filtered.length > 0 ? (
                        <div key={f + sort} className="space-y-8 enter">
                          {/* Visual Search Notice */}
                          <div role="note" className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/90 p-4 text-sm text-indigo-950 dark:border-indigo-500/20 dark:bg-indigo-950/40 dark:text-indigo-200">
                            <Info className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400" size={18} />
                            <p>
                              <b>Visual Search Notice:</b> Reverse image search finds visually similar public web images sharing appearance, scene composition, styling, or lighting. Visual similarity does not confirm that results depict the same person and does not verify identity.
                            </p>
                          </div>

                          {/* Section 1: Exact Image Matches */}
                          <section aria-labelledby="exact-photo-matches-heading" className="space-y-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
                              <div>
                                <h2 id="exact-photo-matches-heading" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                  <span>Exact Image Matches</span>
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                    {sortedExactPhoto.length}
                                  </span>
                                </h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  Public web pages hosting the exact source image file or an identical cropped duplicate.
                                </p>
                              </div>
                            </div>
                            {sortedExactPhoto.length > 0 ? (
                              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {sortedExactPhoto.map(r => (
                                  <Card
                                    key={r.id}
                                    r={r}
                                    saved={keys.has(r.id)}
                                    onSave={() => void toggleSave(r)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                                No exact source image duplicates found.
                              </div>
                            )}
                          </section>

                          {/* Section 2: Visually Similar Images */}
                          <section aria-labelledby="similar-photo-matches-heading" className="space-y-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
                              <div>
                                <h2 id="similar-photo-matches-heading" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                  <span>Visually Similar Images</span>
                                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                                    {sortedSimilarPhoto.length}
                                  </span>
                                </h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  Public web results sharing visual resemblance, styling, or composition. Visual similarity does not confirm real-world identity.
                                </p>
                              </div>
                            </div>
                            {sortedSimilarPhoto.length > 0 ? (
                              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {sortedSimilarPhoto.map(r => (
                                  <Card
                                    key={r.id}
                                    r={r}
                                    saved={keys.has(r.id)}
                                    onSave={() => void toggleSave(r)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                                No visually similar matches found across selected platforms.
                              </div>
                            )}
                          </section>

                          {/* Section 3: Name-Related Public Pages (Combined Search) */}
                          {sortedNamePhoto.length > 0 && (
                            <section aria-labelledby="name-photo-matches-heading" className="space-y-4">
                              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
                                <div>
                                  <h2 id="name-photo-matches-heading" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                    <span>Name-Related Public Pages</span>
                                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                      {sortedNamePhoto.length}
                                    </span>
                                  </h2>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Public profile and web pages matching the searched name. A matching name or visually similar face does not prove that a result depicts the same person.
                                  </p>
                                </div>
                              </div>
                              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {sortedNamePhoto.map(r => (
                                  <Card
                                    key={r.id}
                                    r={r}
                                    saved={keys.has(r.id)}
                                    onSave={() => void toggleSave(r)}
                                  />
                                ))}
                              </div>
                            </section>
                          )}

                          {/* Section 4: Other / Demo Preview Results */}
                          {sortedOtherPhoto.length > 0 && (
                            <section aria-labelledby="other-photo-matches-heading" className="space-y-4">
                              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
                                <div>
                                  <h2 id="other-photo-matches-heading" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                    <span>{execMeta.isDemo ? 'Demo Preview Results' : 'Other Results'}</span>
                                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                                      {sortedOtherPhoto.length}
                                    </span>
                                  </h2>
                                </div>
                              </div>
                              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {sortedOtherPhoto.map(r => (
                                  <Card
                                    key={r.id}
                                    r={r}
                                    saved={keys.has(r.id)}
                                    onSave={() => void toggleSave(r)}
                                  />
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      ) : (
                        <div className="enter mx-auto max-w-lg rounded-2xl border border-dashed border-violet-200 bg-white p-8 text-center sm:p-10">
                          <SearchX className="mx-auto text-violet-400" size={40} />
                          {execMeta.isDemo ? (
                            <>
                              {ctx.thumb && (
                                <div className="mx-auto my-3 flex items-center justify-center gap-3">
                                  <img src={ctx.thumb} alt={ctx.fileName || 'Uploaded preview'} className="h-14 w-14 rounded-xl border border-violet-200 object-cover shadow-sm" />
                                  <div className="text-left text-xs text-slate-600">
                                    <p className="max-w-[200px] truncate font-semibold text-slate-800">{ctx.fileName || 'Uploaded photo'}</p>
                                    <div className="mt-1 flex items-center gap-1">{ctx.platforms.map(p => <PL key={p} p={p} s={16} />)}</div>
                                  </div>
                                </div>
                              )}
                              <h2 className="mt-2 text-lg font-bold">No demo matches found</h2>
                              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                                Live reverse-image search is not currently configured, so this result does not mean that no matching images exist on the internet. In demo mode, PhotoTrace AI never fabricates or invents false matches for your uploaded photos.
                              </p>
                              {f !== 'all' && !ctx.platforms.includes(f) && (
                                <p className="mt-1 text-xs text-slate-500">{PN[f]} was not selected for this search.</p>
                              )}
                              <div className="mt-6 flex flex-wrap justify-center gap-3">
                                {f !== 'all' && (
                                  <button className="btn !rounded-xl border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50" onClick={() => setF('all')}>
                                    Show all platforms
                                  </button>
                                )}
                                <Link to="/search/photo" className="btn grad-anim !rounded-xl">Try Another Photo</Link>
                                <Link to="/search/photo" className="btn !rounded-xl border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50">Change Platforms</Link>
                              </div>
                            </>
                          ) : (
                            <>
                              {ctx.thumb && (
                                <div className="mx-auto my-3 flex items-center justify-center gap-3">
                                  <img src={ctx.thumb} alt={ctx.fileName || 'Uploaded preview'} className="h-14 w-14 rounded-xl border border-violet-200 object-cover shadow-sm" />
                                  <div className="text-left text-xs text-slate-600">
                                    <p className="max-w-[200px] truncate font-semibold text-slate-800">{ctx.fileName || 'Uploaded photo'}</p>
                                    <div className="mt-1 flex items-center gap-1">{ctx.platforms.map(p => <PL key={p} p={p} s={16} />)}</div>
                                  </div>
                                </div>
                              )}
                              <h2 className="mt-2 text-lg font-bold">No public matches found</h2>
                              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                                No public image matches were found across selected platforms for this photo.
                              </p>
                              {f !== 'all' && !ctx.platforms.includes(f) && (
                                <p className="mt-1 text-xs text-slate-500">{PN[f]} was not selected for this search.</p>
                              )}
                              <div className="mt-6 flex flex-wrap justify-center gap-3">
                                {f !== 'all' && (
                                  <button className="btn !rounded-xl border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50" onClick={() => setF('all')}>
                                    Show all platforms
                                  </button>
                                )}
                                <Link to="/search/photo" className="btn grad-anim !rounded-xl">Try Another Photo</Link>
                                <Link to="/search/photo" className="btn !rounded-xl border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50">Change Platforms</Link>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
