export type PlatformId='tiktok'|'instagram'|'facebook'|'linkedin';
export interface PhotoSearchRequest{image:Blob;fileName:string;platforms:PlatformId[]}
export interface PhotoSearchResponse{status:'demo';message:string}
// Demo placeholder. To connect a backend, replace the body with e.g.:
// const fd=new FormData();fd.append('image',req.image,req.fileName);fd.append('platforms',req.platforms.join(','));
// return (await fetch('/api/search/photo',{method:'POST',body:fd})).json();
export async function submitPhotoSearch(req:PhotoSearchRequest):Promise<PhotoSearchResponse>{
 await new Promise(r=>setTimeout(r,1600));
 return {status:'demo',message:`Placeholder service accepted "${req.fileName}" for ${req.platforms.length} platform(s). No search was performed.`};}
