import type {PlatformId} from './photoSearchService';
export interface SearchContext{id:string;type:'photo'|'name';query:string;fileName?:string;thumb?:string;platforms:PlatformId[]}
const K='pt_search_ctx';let mem:SearchContext|null=null;
// In-memory + sessionStorage so a refresh keeps the search (the image thumbnail is a small data URL).
export const setContext=(c:SearchContext)=>{mem=c;try{sessionStorage.setItem(K,JSON.stringify(c))}catch{/* storage unavailable */}};
export const getContext=():SearchContext|null=>{if(mem)return mem;try{const v=sessionStorage.getItem(K);return v?JSON.parse(v) as SearchContext:null}catch{return null}};
export const makeThumb=(blob:Blob)=>new Promise<string>(res=>{const u=URL.createObjectURL(blob);const im=new Image();
 im.onload=()=>{const s=Math.min(1,240/Math.max(im.naturalWidth,im.naturalHeight));const c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);c.getContext('2d')?.drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',.8))};
 im.onerror=()=>{URL.revokeObjectURL(u);res('')};im.src=u});
