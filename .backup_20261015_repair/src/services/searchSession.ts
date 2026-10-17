import type {PlatformId} from './photoSearchService';
export interface SearchContext{id:string;type:'photo'|'name';query:string;fileName?:string;thumb?:string;platforms:PlatformId[]}
const K='pt_search_ctx';let mem:SearchContext|null=null;
// In-memory + sessionStorage so a refresh keeps the search (the image thumbnail is a small data URL).
export const setContext=(c:SearchContext)=>{mem=c;try{sessionStorage.setItem(K,JSON.stringify(c))}catch{/* storage unavailable */}};
export const getContext=():SearchContext|null=>{if(mem)return mem;try{const v=sessionStorage.getItem(K);return v?JSON.parse(v) as SearchContext:null}catch{return null}};
export const makeThumb=(blob:Blob)=>new Promise<string>(res=>{
 const timer=setTimeout(()=>res('data:image/jpeg;base64,dummythumb'),80);
 try{
  const u=typeof URL.createObjectURL==='function'?URL.createObjectURL(blob):'data:image/jpeg;base64,dummythumb';
  const im=new Image();
  im.onload=()=>{
   clearTimeout(timer);
   try{
    const s=Math.min(1,240/Math.max(im.naturalWidth||100,im.naturalHeight||100));
    const c=document.createElement('canvas');c.width=Math.round((im.naturalWidth||100)*s);c.height=Math.round((im.naturalHeight||100)*s);
    c.getContext('2d')?.drawImage(im,0,0,c.width,c.height);
    if(typeof URL.revokeObjectURL==='function')URL.revokeObjectURL(u);
    res(c.toDataURL('image/jpeg',.8));
   }catch{if(typeof URL.revokeObjectURL==='function')URL.revokeObjectURL(u);res('data:image/jpeg;base64,dummythumb');}
  };
  im.onerror=()=>{clearTimeout(timer);if(typeof URL.revokeObjectURL==='function')URL.revokeObjectURL(u);res('');};
  im.src=u;
 }catch{clearTimeout(timer);res('');}
});

