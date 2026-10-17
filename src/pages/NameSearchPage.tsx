import {useState,useRef,FormEvent} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';import {setContext} from '../services/searchSession';
import {Search,X,Check,ShieldCheck,Sparkles,Loader2,Info,Clock,Trash2,AlertCircle} from 'lucide-react';
import {Shell,PL} from '../home/Home';
import {submitNameSearch} from '../services/nameSearchService';import type {PlatformId} from '../services/photoSearchService';
import {ls,lsSet} from '../utils';
interface Recent{id:string;q:string;at:number;platforms:PlatformId[]}
const ALLP:[PlatformId,string,string][]=[['tiktok','TikTok','Videos, photos and profiles'],['instagram','Instagram','Photos, reels and profiles'],['facebook','Facebook','Public posts and profiles'],['linkedin','LinkedIn','Professional profiles and posts']];
const IDS=ALLP.map(p=>p[0]);const KEY='pt_name_recent';
const EX=['sarah khan','travelwithme','john.doe','mohammad ali','priya_sharma','alice.wong'];
const seed=():Recent[]=>{const n=Date.now();return[['sarah khan',12*60e3],['travelwithme',3*36e5],['john.doe',26*36e5]].map(([q,d],i)=>({id:'s'+i,q:q as string,at:n-(d as number),platforms:IDS}))};
const ago=(t:number)=>{const m=Math.round((Date.now()-t)/6e4);return m<1?'Just now':m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:new Date(t).toLocaleDateString()};
export default function NameSearchPage(){const nav=useNavigate();const [sp]=useSearchParams();
 const inp=useRef<HTMLInputElement>(null);const [q,setQ]=useState(sp.get('q')?.slice(0,80)||'');const [err,setErr]=useState('');const [plats,setPlats]=useState<PlatformId[]>(IDS);const [busy,setBusy]=useState(false);const [result,setResult]=useState('');
 const [recent,setRecentS]=useState<Recent[]>(()=>{try{if(localStorage.getItem(KEY)===null){const s=seed();lsSet(KEY,s);return s}}catch{/* no storage */}return ls<Recent[]>(KEY,[])});
 const setRecent=(r:Recent[])=>{setRecentS(r);lsSet(KEY,r)};
 const all=plats.length===4;const toggle=(id:PlatformId)=>setPlats(plats.includes(id)?plats.filter(x=>x!==id):[...plats,id]);
 const validate=(v:string)=>!v?'Please enter a name or username.':v.length<2?'Enter at least 2 characters.':v.length>60?'Keep it under 60 characters.':!/[\p{L}\p{N}]/u.test(v)?'Use letters or numbers in your search.':!plats.length?'Select at least one platform.':'';
 const submit=async(e?:FormEvent)=>{e?.preventDefault();if(busy)return;const v=q.trim();const m=validate(v);setErr(m);setResult('');if(m){inp.current?.focus();return}
  setBusy(true);
  try{
   const res=await submitNameSearch({query:v,platforms:plats});
   setRecent([{id:String(Date.now()),q:v,at:Date.now(),platforms:plats},...recent.filter(x=>x.q.toLowerCase()!==v.toLowerCase())].slice(0,8));
   setContext({id:String(Date.now()),type:'name',query:v,platforms:plats,isDemo:res.isDemo,provider:res.provider});
   nav('/results');
  }catch(err:any){
   setErr(err?.message||'Search failed. Please try again.');
   inp.current?.focus();
  }finally{
   setBusy(false);
  }};
 const card='rounded-2xl border border-violet-100 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/5 dark:text-white';
 const ghost='btn border border-violet-300 bg-white !text-violet-700 hover:bg-violet-50';
 return <Shell onSearch={()=>inp.current?.focus()}>{()=><>
  <section className="relative overflow-hidden bg-[#050a2e] text-white"><div aria-hidden className="glow left-[-10%] top-[-40%] bg-blue-600/30"/><div aria-hidden className="glow glow-b right-[-10%] top-[-20%] bg-fuchsia-600/25"/>
   <div className="enter relative mx-auto max-w-[1400px] px-4 py-12 text-center sm:px-6 lg:px-10 lg:py-16"><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs"><Sparkles size={12}/>AI-Powered Name Search</span>
    <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">Name <span className="bg-gradient-to-r from-blue-400 to-fuchsia-500 bg-clip-text text-transparent">Search</span></h1>
    <p className="mx-auto mt-4 max-w-2xl text-slate-200">Enter a name or username to explore publicly available profiles and posts across supported social media platforms.</p><p className="mt-3 text-xs text-slate-400">Searching as a guest · no account needed</p></div></section>
  <div className="bg-[#f6f4ff] dark:bg-[#0a0f33]"><div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
   <form onSubmit={e=>void submit(e)} noValidate className={`${card} enter`} aria-labelledby="nm">
    <h2 id="nm" className="text-xl font-bold">Search by name or username</h2>
    <div className="mt-4 flex"><div className="relative min-w-0 flex-1"><Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500"/>
     <input ref={inp} aria-label="Name or username" aria-invalid={!!err} aria-describedby="nm-err" value={q} maxLength={80} autoComplete="off" onChange={e=>{setQ(e.target.value);setErr('')}} placeholder="Enter a name or username..." className="h-14 w-full rounded-l-xl border border-slate-200 bg-white pl-12 pr-11 text-base text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-200"/>
     {q&&<button type="button" aria-label="Clear input" onClick={()=>{setQ('');setErr('');inp.current?.focus()}} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16}/></button>}</div>
     <button type="submit" disabled={busy} aria-busy={busy} className="btn grad-anim !h-14 shrink-0 !rounded-l-none !rounded-r-xl px-5 sm:px-8">{busy?<Loader2 className="animate-spin" size={20}/>:<Search size={20}/>}<span className="hidden min-[420px]:inline">{busy?'Searching…':'Search'}</span></button></div>
    <div id="nm-err" role="alert">{err&&<p className="mt-2 flex items-center gap-1.5 text-sm text-red-600"><AlertCircle size={14}/>{err}</p>}</div>
    <p className="mb-2 mt-5 text-sm font-medium">Try these examples:</p><div className="flex flex-wrap gap-2.5">{EX.map(c=><button type="button" key={c} onClick={()=>{setQ(c);setErr('');inp.current?.focus()}} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 transition hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-50 active:scale-95">{c}</button>)}</div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Platforms to Search</h3><p className="text-sm text-slate-500">{plats.length} of 4 selected</p></div><button type="button" className={ghost} onClick={()=>setPlats(all?[]:IDS)}>{all?'Clear all':'Select all'}</button></div>
    <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">{ALLP.map(([id,n,d])=>{const on=plats.includes(id);return <button type="button" key={id} aria-pressed={on} onClick={()=>{toggle(id);setErr('')}} className={`relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${on?'border-violet-500 bg-violet-50 dark:bg-violet-500/20':'border-slate-200 bg-white opacity-80 dark:border-white/10 dark:bg-white/5'}`}><PL p={id} s={40}/><span className="font-bold">{n}</span><span className="text-xs text-slate-500 dark:text-slate-300">{d}</span><span className={`absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full border transition ${on?'border-violet-600 bg-violet-600 text-white':'border-slate-300'}`}>{on&&<Check size={14}/>}</span></button>})}</div>
    <p role="status" className="mt-4 text-center text-sm text-slate-500">{busy?'Searching public profiles and posts…':''}</p>
    {result&&<div role="status" className="enter mx-auto mt-2 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="flex items-center gap-2 font-semibold"><Info size={16}/>Demo state – no live search performed</p><p className="mt-1">{result} The Search Results page is the next step and has not been built yet.</p></div>}</form>
   <section aria-labelledby="rc" className={card}><div className="flex items-center justify-between gap-3"><h2 id="rc" className="flex items-center gap-2 text-xl font-bold"><Clock size={20} className="text-violet-600"/>Recent Searches</h2>{recent.length>0&&<button className={`${ghost} !py-1.5`} onClick={()=>setRecent([])}><Trash2 size={14}/>Clear All</button>}</div>
    <p className="mt-1 text-sm text-slate-500">Saved only in this browser as demo history. Starter examples are shown until you clear them.</p>
    {recent.length?<ul className="mt-4 space-y-2">{recent.map(r=><li key={r.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white transition hover:border-violet-300 dark:border-white/10 dark:bg-white/5"><button className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left" onClick={()=>{setQ(r.q);setPlats(r.platforms);setErr('');setResult('');inp.current?.focus()}} aria-label={`Reuse search ${r.q}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-600"><Search size={16}/></span><span className="min-w-0"><span className="block truncate font-medium">{r.q}</span><span className="block text-xs text-slate-500">{ago(r.at)} · {r.platforms.length} platform{r.platforms.length>1?'s':''}</span></span></button>
     <button aria-label={`Remove ${r.q}`} onClick={()=>setRecent(recent.filter(x=>x.id!==r.id))} className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={16}/></button></li>)}</ul>
    :<div className="mt-4 rounded-xl border border-dashed border-violet-200 p-8 text-center text-sm text-slate-500"><Clock className="mx-auto mb-2 text-violet-300" size={28}/>No recent searches yet. Your searches will appear here.</div>}</section>
   <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"><ShieldCheck className="mt-0.5 shrink-0 text-blue-600" size={20}/><p>Only information from accessible public sources can be searched – never private profiles. Matching names may refer to different people, so results can never confirm anyone's identity. <b>This demo does not contact any platform.</b></p></div>
  </div></div></>}</Shell>}
