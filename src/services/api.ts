const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const isProd = import.meta.env.PROD && import.meta.env.MODE === 'production';
const BASE = envUrl || (isProd ? 'https://phototrace-backend.onrender.com' : (import.meta.env.DEV ? 'http://localhost:8000' : ''));
export interface ProfileData{bio:string|null;instagram_url:string|null;tiktok_url:string|null;facebook_url:string|null;linkedin_url:string|null;has_photo:boolean;is_public:boolean;show_bio:boolean;show_social_links:boolean}
export interface AppUser{id:string;full_name:string;email:string|null;phone:string|null;country:string;is_verified:boolean;profile:ProfileData|null}
export interface Session{user:AppUser;csrf_token:string}
export interface StartResponse{message:string;contact_masked?:string;expires_in?:number;resend_after:number}
export class ApiError extends Error{constructor(public status:number,message:string,public retryAfter?:number){super(message)}}
let csrf='';// kept in memory only – never in localStorage
export const setCsrf=(t:string)=>{csrf=t};
export const photoUrl=(v:number)=>`${BASE}/api/v1/profile/photo?v=${v}`;
async function req<T>(method:string,path:string,body?:unknown,form?:FormData):Promise<T>{
 const controller=new AbortController();
 const timeoutId=setTimeout(()=>controller.abort(),45000);
 let res:Response;
 try{
  res=await fetch(`${BASE}/api/v1${path}`,{
   method,
   credentials:'include',
   signal:controller.signal,
   headers:{...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'&&csrf?{'X-CSRF-Token':csrf}:{})},
   body:form??(body?JSON.stringify(body):undefined)
  });
 }catch(err:any){
  if(err?.name==='AbortError'){throw new ApiError(504,'Search request timed out. The server took too long to respond.')}
  throw new ApiError(0,'Cannot reach the server. Check your connection, or that the backend is running.');
 }finally{clearTimeout(timeoutId)}
 const data=await res.json().catch(()=>null);
 if(!res.ok){
  const d=data?.detail;
  const msg=typeof d==='string'&&d.trim()?d.trim():Array.isArray(d)?d.map((x:{msg:string})=>String(x.msg).replace(/^Value error, /,'')).join(' '):'Something went wrong. Please try again.';
  throw new ApiError(res.status,msg,Number(res.headers.get('Retry-After'))||undefined);
 }
 return data as T}
export interface HistoryRow{id:string;type:'photo'|'name';query:string;thumb:string|null;platforms:string[];result_count:number;status:string;created_at:string}
export interface SavedRow{result_key:string;platform:string;account:string|null;caption:string|null;match_type:string|null;source_url:string|null;saved_at:string}
export interface RegisterInput{full_name:string;email?:string;phone?:string;date_of_birth:string;country:string}
export type PlatformId='tiktok'|'instagram'|'facebook'|'linkedin'|'other';
export type MatchType='Exact Image Match'|'Similar Image'|'Name Match'|'Demo Preview';
export interface SearchResultItem{id:string;platform:PlatformId;user:string;caption:string;matchType:MatchType;confidence:number;img:string|null;sourceUrl:string|null;date:string|null;isDemo?:boolean;provider?:string;metadata?:Record<string,unknown>}
export interface SearchApiResponse{query:string;searchType:'name'|'photo';platforms:PlatformId[];provider:string;isDemo:boolean;results:SearchResultItem[];message?:string}
export interface ProviderStatus{active_provider:string;is_live:boolean;providers:Record<string,{configured:boolean;name:string;live:boolean}>;instructions:string}
export const api={
 registerStart:(b:RegisterInput)=>req<StartResponse>('POST','/auth/register/start',b),
 registerVerify:(identifier:string,code:string)=>req<Session>('POST','/auth/register/verify',{identifier,code}),
 loginStart:(identifier:string)=>req<StartResponse>('POST','/auth/login/start',{identifier}),
 loginVerify:(identifier:string,code:string)=>req<Session>('POST','/auth/login/verify',{identifier,code}),
 me:()=>req<Session>('GET','/auth/me'),logout:()=>req<{message:string}>('POST','/auth/logout',{}),
 updateProfile:(b:Partial<Pick<ProfileData,'bio'|'instagram_url'|'tiktok_url'|'facebook_url'|'linkedin_url'>>)=>req<ProfileData>('PATCH','/profile',b),
 updateVisibility:(b:Partial<Pick<ProfileData,'is_public'|'show_bio'|'show_social_links'>>)=>req<ProfileData>('PATCH','/profile/visibility',b),
 uploadPhoto:(f:File)=>{const fd=new FormData();fd.append('file',f);return req<ProfileData>('POST','/profile/photo',undefined,fd)},
 searchProviders:()=>req<ProviderStatus>('GET','/search/providers'),
 searchName:(query:string,platforms:PlatformId[])=>req<SearchApiResponse>('POST','/search/name',{query,platforms}),
 searchPhoto:(image:Blob,fileName:string,platforms:PlatformId[],isSample?:boolean,name?:string)=>{const fd=new FormData();fd.append('file',image,fileName);fd.append('platforms',platforms.join(','));if(isSample!==undefined)fd.append('is_sample',String(isSample));if(name&&name.trim())fd.append('name',name.trim());return req<SearchApiResponse>('POST','/search/photo',undefined,fd)},
 getSearchResult:(id:string)=>req<SearchResultItem>('GET',`/search/results/${encodeURIComponent(id)}`),
 listHistory:()=>req<HistoryRow[]>('GET','/history'),addHistory:(b:object)=>req<HistoryRow>('POST','/history',b),deleteHistory:(id:string)=>req<{message:string}>('DELETE',`/history/${encodeURIComponent(id)}`,{}),clearHistory:()=>req<{message:string}>('DELETE','/history',{}),
 listSaved:()=>req<SavedRow[]>('GET','/saved'),addSaved:(b:object)=>req<SavedRow>('POST','/saved',b),removeSaved:(k:string)=>req<{message:string}>('DELETE',`/saved/${encodeURIComponent(k)}`,{}),
 deletePhoto:()=>req<ProfileData>('DELETE','/profile/photo',{}),deleteAccount:()=>req<{message:string}>('DELETE','/account',{})};

