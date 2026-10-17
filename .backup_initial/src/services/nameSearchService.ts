import type {PlatformId} from './photoSearchService';
export interface NameSearchRequest{query:string;platforms:PlatformId[]}
export interface NameSearchResponse{status:'demo';message:string}
// Demo placeholder. Replace with an authorized backend call, e.g.
// return (await fetch('/api/search/name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)})).json();
export async function submitNameSearch(req:NameSearchRequest):Promise<NameSearchResponse>{
 await new Promise(r=>setTimeout(r,1500));
 return {status:'demo',message:`Placeholder service accepted "${req.query}" for ${req.platforms.length} platform(s). No search was performed.`};}
