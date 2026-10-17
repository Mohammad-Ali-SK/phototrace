import {useMemo} from 'react';
import {api,HistoryRow,SavedRow} from './api';import type {PlatformId} from './photoSearchService';import {ls,lsSet} from '../utils';import {demoResult} from './resultsService';import {useAuth} from '../auth/AuthContext';
export type HStatus='completed'|'empty'|'failed';
export interface HistoryItem{id:string;type:'photo'|'name';query:string;thumb:string|null;platforms:PlatformId[];resultCount:number;status:HStatus;createdAt:string}
export interface SavedItem{resultKey:string;platform:PlatformId;account:string|null;caption:string|null;matchType:string|null;sourceUrl:string|null;savedAt:string}
export type NewHistory=Omit<HistoryItem,'id'|'createdAt'>;export type NewSaved=Omit<SavedItem,'savedAt'>;
export interface Store{mode:'account'|'guest';listHistory():Promise<HistoryItem[]>;addHistory(h:NewHistory):Promise<void>;deleteHistory(id:string):Promise<void>;clearHistory():Promise<void>;listSaved():Promise<SavedItem[]>;addSaved(s:NewSaved):Promise<void>;removeSaved(k:string):Promise<void>;seedSample?():Promise<void>}
const toH=(r:HistoryRow):HistoryItem=>({id:r.id,type:r.type,query:r.query,thumb:r.thumb,platforms:r.platforms as PlatformId[],resultCount:r.result_count,status:r.status as HStatus,createdAt:r.created_at});
const toS=(r:SavedRow):SavedItem=>({resultKey:r.result_key,platform:r.platform as PlatformId,account:r.account,caption:r.caption,matchType:r.match_type,sourceUrl:r.source_url,savedAt:r.saved_at});
// Signed-in users: real backend (PostgreSQL, scoped to the user). The backend ignores thumbnails for name searches.
const accountStore:Store={mode:'account',
 listHistory:async()=>(await api.listHistory()).map(toH),
 addHistory:async h=>{await api.addHistory({type:h.type,query:h.query,thumb:h.thumb,platforms:h.platforms,result_count:h.resultCount,status:h.status})},
 deleteHistory:async id=>{await api.deleteHistory(id)},clearHistory:async()=>{await api.clearHistory()},
 listSaved:async()=>(await api.listSaved()).map(toS),
 addSaved:async s=>{await api.addSaved({result_key:s.resultKey,platform:s.platform,account:s.account,caption:s.caption,match_type:s.matchType,source_url:s.sourceUrl})},
 removeSaved:async k=>{await api.removeSaved(k)}};
// Guests: browser localStorage ONLY. Not secure, not synced, never merged with account data.
const ALLP:PlatformId[]=['tiktok','instagram','facebook','linkedin'];
const GH='pt_guest_history',GS='pt_guest_saved';
const guestStore:Store={mode:'guest',
 listHistory:async()=>ls<HistoryItem[]>(GH,[]),
 addHistory:async h=>{lsSet(GH,[{...h,id:'g'+Date.now()+Math.random().toString(36).slice(2,6),createdAt:new Date().toISOString()},...ls<HistoryItem[]>(GH,[])].slice(0,50))},
 deleteHistory:async id=>lsSet(GH,ls<HistoryItem[]>(GH,[]).filter(x=>x.id!==id)),clearHistory:async()=>lsSet(GH,[]),
 listSaved:async()=>ls<SavedItem[]>(GS,[]),
 addSaved:async s=>{const l=ls<SavedItem[]>(GS,[]);if(!l.some(x=>x.resultKey===s.resultKey))lsSet(GS,[{...s,savedAt:new Date().toISOString()},...l])},
 removeSaved:async k=>lsSet(GS,ls<SavedItem[]>(GS,[]).filter(x=>x.resultKey!==k)),
 // Demo-only sample entries for exploring the UI. Clearly labelled in the UI; stored only in this browser.
 seedSample:async()=>{const d=(n:number)=>new Date(Date.now()-n*864e5).toISOString();const mk=(id:string,type:'photo'|'name',query:string,platforms:PlatformId[],resultCount:number,status:HStatus,n:number,thumb:string|null=null):HistoryItem=>({id,type,query,thumb,platforms,resultCount,status,createdAt:d(n)});
  const have=new Set(ls<HistoryItem[]>(GH,[]).map(x=>x.id));
  lsSet(GH,[...ls<HistoryItem[]>(GH,[]),...[mk('gs1','name','sarah khan',ALLP,12,'completed',0),mk('gs2','photo','sample-portrait.jpg',['instagram','tiktok'],7,'completed',2,demoResult('d1')?.img??null),mk('gs3','name','travelwithme',['instagram'],3,'completed',10),mk('gs4','name','john.doe',ALLP,0,'empty',40)].filter(x=>!have.has(x.id))]);
  const sv=ls<SavedItem[]>(GS,[]);const add=(k:string,n:number)=>{const r=demoResult(k);if(r&&!sv.some(x=>x.resultKey===k))sv.push({resultKey:k,platform:r.platform,account:r.user,caption:r.caption,matchType:r.match,sourceUrl:r.sourceUrl,savedAt:d(n)})};add('d1',1);add('d4',5);lsSet(GS,sv)}};
export function useStore():Store{const {user}=useAuth();const id=user?.id??'guest';return useMemo(()=>id==='guest'?guestStore:accountStore,[id])}
