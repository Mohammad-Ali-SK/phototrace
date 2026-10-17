import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Info, Heart, ShieldCheck, Check } from 'lucide-react';
import { Shell, PL } from '../home/Home';
import { getCachedResult, DemoResult } from '../services/resultsService';
import { useStore } from '../services/historyService';
import { useAuth } from '../auth/AuthContext';
import { api } from '../services/api';
import type { PlatformId } from '../services/photoSearchService';

const PN: Record<PlatformId, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

export default function DetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<DemoResult | undefined>(() => (id ? getCachedResult(id) : undefined));
  const [loading, setLoading] = useState<boolean>(!result && !!id);
  const [saved, setSaved] = useState<boolean>(false);
  const [saveMsg, setSaveMsg] = useState<string>('');
  const store = useStore();
  const { loading: authLoading } = useAuth();

  useEffect(() => {
    if (!id) return;
    const local = getCachedResult(id);
    if (local) {
      setResult(local);
      setLoading(false);
      return;
    }
    // Attempt backend lookup
    let active = true;
    setLoading(true);
    api.getSearchResult(id)
      .then(res => {
        if (!active) return;
        const mapped: DemoResult = {
          id: res.id,
          platform: res.platform,
          user: res.user,
          caption: res.caption,
          date: res.date || new Date().toISOString().slice(0, 10),
          match: res.matchType,
          confidence: Math.round(res.confidence),
          img: res.img || '',
          sourceUrl: res.sourceUrl,
          isDemo: res.isDemo ?? true,
          provider: res.provider || 'demo',
          metadata: res.metadata,
        };
        setResult(mapped);
      })
      .catch(() => {
        // Not found
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!result || authLoading) return;
    store.listSaved()
      .then(items => setSaved(items.some(x => x.resultKey === result.id)))
      .catch(() => setSaved(false));
  }, [result, authLoading, store]);

  const toggleSave = async () => {
    if (!result) return;
    const next = !saved;
    setSaved(next);
    setSaveMsg('');
    try {
      if (next) {
        await store.addSaved({
          resultKey: result.id,
          platform: result.platform,
          account: result.user,
          caption: result.caption,
          matchType: result.match,
          sourceUrl: result.sourceUrl,
        });
        setSaveMsg('Saved to your saved results.');
      } else {
        await store.removeSaved(result.id);
        setSaveMsg('Removed from saved results.');
      }
    } catch {
      setSaved(!next);
      setSaveMsg('Could not update saved status.');
    }
  };

  const isDemo = result?.isDemo !== false;

  return <Shell>{() => <>
    <section className="relative overflow-hidden bg-[#050a2e] text-white">
      <div aria-hidden className="glow left-[-10%] top-[-40%] bg-blue-600/30" />
      <div aria-hidden className="glow glow-b right-[-10%] top-[-20%] bg-fuchsia-600/25" />
      <div className="relative mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <Link to="/results" className="inline-flex items-center gap-2 text-sm text-slate-200 hover:text-white transition">
          <ArrowLeft size={16} /> Back to results
        </Link>
        <p className="mt-5 text-sm text-slate-300">PhotoTrace AI · Result details</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Match Details</h1>
      </div>
    </section>

    <main className="min-h-[50vh] bg-[#f6f4ff] px-4 py-10 dark:bg-[#0a0f33]">
      <div className="mx-auto max-w-5xl">
        {loading ? (
          <section className="rounded-2xl border border-violet-100 bg-white p-8 text-center dark:border-white/10 dark:bg-white/5">
            <p className="text-slate-500">Loading result details…</p>
          </section>
        ) : !result ? (
          <section className="rounded-2xl border border-violet-100 bg-white p-8 text-center dark:border-white/10 dark:bg-white/5">
            <h2 className="text-xl font-bold">Result not found</h2>
            <p className="mt-2 text-slate-500">This result could not be located in your current session or sample database.</p>
            <div className="mt-5 flex justify-center gap-3">
              <Link to="/results" className="btn border border-violet-300 bg-white !text-violet-700">Back to Results</Link>
              <Link to="/search/name" className="btn grad-anim">Start a New Search</Link>
            </div>
          </section>
        ) : (
          <article className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
            <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-[minmax(240px,360px)_1fr]">
              <div className="space-y-4">
                {result.img ? (
                  <img src={result.img} alt={`Thumbnail preview for ${result.user}`} className="max-h-[440px] w-full rounded-xl object-cover shadow-sm" />
                ) : (
                  <div className="grid h-64 place-items-center rounded-xl bg-slate-100 text-slate-400">
                    <span>No image preview available</span>
                  </div>
                )}
                <button
                  onClick={toggleSave}
                  aria-pressed={saved}
                  className={`btn w-full !rounded-xl border ${saved ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  <Heart size={16} className={saved ? 'fill-rose-500 text-rose-500' : 'text-slate-500'} />
                  {saved ? 'Saved in Results' : 'Save Result'}
                </button>
                {saveMsg && <p role="status" className="text-center text-xs text-slate-500">{saveMsg}</p>}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <PL p={result.platform} s={36} />
                  <span className="text-lg font-bold">{PN[result.platform]}</span>
                  {isDemo ? (
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                      Demo result
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                      <ShieldCheck size={12} /> Verified Public Result
                    </span>
                  )}
                </div>

                <h2 className="mt-4 break-words text-2xl font-bold">{result.user}</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-300">{result.caption}</p>

                <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-violet-50/70 p-4 dark:bg-white/10">
                    <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Match type</dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{result.match}</dd>
                  </div>
                  <div className="rounded-xl bg-violet-50/70 p-4 dark:bg-white/10">
                    <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      {isDemo ? 'Illustrative score' : 'Confidence'}
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                      {result.confidence}% {isDemo && <span className="text-xs font-normal text-slate-500">(sample value)</span>}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-violet-50/70 p-4 dark:bg-white/10 sm:col-span-2">
                    <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      {isDemo ? 'Illustrative discovery date' : 'Discovery date'}
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                      {result.date ? new Date(result.date + (result.date.includes('T') ? '' : 'T00:00:00')).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not provided'}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Source Evidence</h3>
                  {result.sourceUrl ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                      <p className="font-semibold">Public Page Found:</p>
                      <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-xs font-mono underline hover:text-emerald-700">
                        {result.sourceUrl}
                      </a>
                    </div>
                  ) : (
                    <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <Info size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">No direct source URL available.</p>
                        <p className="mt-1 text-xs text-amber-800">
                          {isDemo
                            ? 'This entry is illustrative sample data. No live platform search was performed and no public link was created.'
                            : 'The search provider identified this public match but did not provide a canonical web link.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  {result.sourceUrl ? (
                    <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn grad-anim flex-1 !rounded-xl">
                      Open original page <ExternalLink size={16} />
                    </a>
                  ) : (
                    <button disabled className="btn flex-1 !rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                      Preview only – no source link
                    </button>
                  )}
                  <Link to="/results" className="btn !rounded-xl border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50">
                    <ArrowLeft size={16} /> Back to results
                  </Link>
                </div>
              </div>
            </div>
          </article>
        )}
      </div>
    </main>
  </>}</Shell>;
}
