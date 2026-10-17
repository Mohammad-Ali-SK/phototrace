import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Info } from 'lucide-react';
import { Shell, PL } from '../home/Home';
import { demoResult } from '../services/resultsService';
import type { PlatformId } from '../services/photoSearchService';

const PN: Record<PlatformId, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

export default function DetailsPage() {
  const { id } = useParams<{ id: string }>();
  const result = id ? demoResult(id) : undefined;

  return <Shell>{() => <>
    <section className="relative overflow-hidden bg-[#050a2e] text-white">
      <div aria-hidden className="glow left-[-10%] top-[-40%] bg-blue-600/30" />
      <div aria-hidden className="glow glow-b right-[-10%] top-[-20%] bg-fuchsia-600/25" />
      <div className="relative mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <Link to="/results" className="inline-flex items-center gap-2 text-sm text-slate-200 hover:text-white">
          <ArrowLeft size={16} /> Back to results
        </Link>
        <p className="mt-5 text-sm text-slate-300">PhotoTrace AI ? Result details</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Match Details</h1>
      </div>
    </section>

    <main className="min-h-[50vh] bg-[#f6f4ff] px-4 py-10 dark:bg-[#0a0f33]">
      <div className="mx-auto max-w-5xl">
        {!result ? (
          <section className="rounded-2xl border border-violet-100 bg-white p-8 dark:border-white/10 dark:bg-white/5">
            <h2 className="text-xl font-bold">Result not found</h2>
            <p className="mt-2 text-slate-500">This demo result is not available.</p>
            <Link to="/search/name" className="btn grad-anim mt-5">Start a new search</Link>
          </section>
        ) : (
          <article className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
            <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-[minmax(220px,360px)_1fr]">
              <img src={result.img} alt={`Illustrative demo image for ${result.user}`} className="max-h-[480px] w-full rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <PL p={result.platform} s={38} />
                  <span className="font-semibold">{PN[result.platform]}</span>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">Demo result</span>
                </div>
                <h2 className="mt-5 break-words text-2xl font-bold">{result.user}</h2>
                <p className="mt-3 text-slate-600 dark:text-slate-300">{result.caption}</p>

                <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-violet-50 p-4 dark:bg-white/10">
                    <dt className="text-sm text-slate-500">Match type</dt>
                    <dd className="mt-1 font-semibold">{result.match}</dd>
                  </div>
                  <div className="rounded-xl bg-violet-50 p-4 dark:bg-white/10">
                    <dt className="text-sm text-slate-500">Illustrative score</dt>
                    <dd className="mt-1 font-semibold">{result.confidence}%</dd>
                  </div>
                  <div className="rounded-xl bg-violet-50 p-4 dark:bg-white/10 sm:col-span-2">
                    <dt className="text-sm text-slate-500">Illustrative date</dt>
                    <dd className="mt-1 font-semibold">{new Date(result.date + 'T00:00:00').toLocaleDateString()}</dd>
                  </div>
                </dl>

                {!result.sourceUrl && (
                  <div role="note" className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <Info size={18} className="mt-0.5 shrink-0" />
                    <p>This is sample data, not a verified social-media match. No live platform search was performed, and no original profile URL is available.</p>
                  </div>
                )}

                {result.sourceUrl && (
                  <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn grad-anim mt-5 w-full">
                    Open original page <ExternalLink size={16} />
                  </a>
                )}

                <Link to="/results" className="btn mt-4 w-full border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50">
                  <ArrowLeft size={16} /> Back to all results
                </Link>
              </div>
            </div>
          </article>
        )}
      </div>
    </main>
  </>}</Shell>;
}
