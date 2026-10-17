import {createContext,useContext,useState,ReactNode} from 'react';import {Result,Search} from '../types';import {getHistory,setHistory} from '../services/searchService';import {ls} from '../utils';
interface C{search:Search|null;setSearch:(s:Search)=>void;results:Result[];setResults:(r:Result[])=>void;notify:(m:string)=>void;addHistory:(s:Search,n:number)=>void}
const Ctx=createContext<C>(null as unknown as C);export const useApp=()=>useContext(Ctx);
export function AppProvider({children}:{children:ReactNode}){
 const [search,setSearch]=useState<Search|null>(null);const [results,setResults]=useState<Result[]>([]);const [toast,setToast]=useState('');
 const notify=(m:string)=>{setToast(m);setTimeout(()=>setToast(''),2600)};
 const addHistory=(s:Search,n:number)=>{if(!ls('pt_hist_on',true))return;const h=getHistory().filter(e=>e.id!==s.id);
  setHistory([{id:s.id,type:s.type,q:s.q,at:new Date().toLocaleString(),count:n,platforms:s.platforms},...h].slice(0,50))};
 return <Ctx.Provider value={{search,setSearch,results,setResults,notify,addHistory}}>{children}
  <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">{toast&&<div className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-xl">{toast}</div>}</div></Ctx.Provider>}
