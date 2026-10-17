import {Result,Search,HistoryEntry} from '../types';import {ALL} from '../data/demo';import {ls,lsSet} from '../utils';
// Demo service: replace body with a fetch() to your FastAPI endpoint (e.g. POST /api/search).
export async function runSearch(s:Search):Promise<Result[]>{
 await new Promise(r=>setTimeout(r,1500));
 const q=s.q.toLowerCase();
 if(s.type==='name'&&q==='error')throw new Error('Demo error');
 if(s.type==='name'&&q==='empty')return [];
 return ALL.filter(r=>s.platforms.includes(r.platform));}
export const getHistory=()=>ls<HistoryEntry[]>('pt_demo_history',[]);
export const setHistory=(h:HistoryEntry[])=>lsSet('pt_demo_history',h);
export const getSaved=()=>ls<string[]>('pt_demo_saved',[]);
export const setSaved=(s:string[])=>lsSet('pt_demo_saved',s);
