import type {PlatformId} from './photoSearchService';import type {SearchContext} from './searchSession';
import p1 from '../assets/p1.jpg';import p2 from '../assets/p2.jpg';import p3 from '../assets/p3.jpg';import p4 from '../assets/p4.jpg';import p5 from '../assets/p5.jpg';import p6 from '../assets/p6.jpg';import p7 from '../assets/p7.jpg';import p8 from '../assets/p8.jpg';import p9 from '../assets/p9.jpg';
export type MatchType='Exact Image Match'|'Similar Image'|'Name Match';
export interface DemoResult{id:string;platform:PlatformId;user:string;caption:string;date:string;match:MatchType;confidence:number;img:string;sourceUrl:string|null}
const E='Exact Image Match',S='Similar Image';
const rows:[PlatformId,string,string,string,MatchType,number,string][]=[
['tiktok','@sarah_diaries','Golden hour walk 🌅 #vlog','2026-09-28',E,98,p1],['tiktok','@city.clips','Weekend dance challenge','2026-09-10',S,84,p6],['tiktok','@travel.with.s','Coffee run in Lisbon ☕','2026-08-15',S,71,p9],
['instagram','@sarahofficial','Exploring the world ✈️ Travel | Life','2026-10-02',E,95,p2],['instagram','@s.k.photos','Sunset portrait series','2026-09-20',S,88,p5],['instagram','@wanderlust_sk','Beach day, no filter','2026-08-02',S,80,p8],['instagram','@studio.nine','Behind the scenes shoot','2026-07-14',S,66,p4],
['facebook','Sarah Khan','Profile photo update','2026-09-18',E,92,p7],['facebook','S. Khan Photography','Album: Summer trip','2026-08-09',S,78,p3],['facebook','Sarah K.','Shared a memory from 2021','2026-06-30',S,64,p2],
['linkedin','Sarah Khan – Software Engineer','Excited to join a new team!','2026-09-05',E,88,p6],['linkedin','Sarah K. | Product Design','Speaking at DesignConf','2026-06-12',S,69,p8]];
const DATA:DemoResult[]=rows.map((r,i)=>({id:'d'+(i+1),platform:r[0],user:r[1],caption:r[2],date:r[3],match:r[4],confidence:r[5],img:r[6],sourceUrl:null}));
export const demoResult=(id:string)=>DATA.find(d=>d.id===id);
// Demo data layer. Replace with a call to an authorized backend (e.g. POST /api/search/results) returning DemoResult-shaped data.
// Tip for testing: a name search for "error" shows the error state, "empty" shows the no-results state.
export async function fetchResults(c:SearchContext):Promise<DemoResult[]>{
 await new Promise(r=>setTimeout(r,500));
 const q=c.query.trim().toLowerCase();

 if(c.type==='name'){
  if(q==='error')throw new Error('Demo error');
  if(!q||q==='empty')return [];
  const tokens=q.split(/[\s._@-]+/).filter(t=>t.length>=2);
  return DATA.filter(d=>{
   if(!c.platforms.includes(d.platform))return false;
   const haystack=`${d.user} ${d.caption} ${d.platform}`.toLowerCase();
   return tokens.some(t=>haystack.includes(t));
  }).map(d=>({...d,match:'Name Match' as MatchType}));
 }

 return DATA.filter(d=>c.platforms.includes(d.platform));
}
