import {Result,Platform,Match} from '../types';import {avatar} from '../utils';
export const PLATFORMS:Platform[]=['TikTok','Instagram','Facebook','LinkedIn'];
export const PCOLOR:Record<Platform,string>={TikTok:'bg-black',Instagram:'bg-gradient-to-br from-fuchsia-500 to-orange-400',Facebook:'bg-blue-600',LinkedIn:'bg-sky-700'};
const rows:[Platform,string,string,string,Match,number][]=[
['TikTok','@sarah_diaries','Golden hour walk 🌅 #vlog','5 days ago','Exact Match',98],['TikTok','@city.clips','Weekend dance challenge','2 weeks ago','Similar Image',84],['TikTok','@travel.with.s','Coffee run in Lisbon ☕','1 month ago','Partial Match',71],
['Instagram','@sarahofficial','Exploring the world ✈️ Travel | Life','1 week ago','Exact Match',95],['Instagram','@s.k.photos','Sunset portrait series','3 weeks ago','Similar Image',88],['Instagram','@wanderlust_sk','Beach day, no filter','2 months ago','Similar Image',80],['Instagram','@studio.nine','Behind the scenes shoot','3 months ago','Partial Match',66],
['Facebook','Sarah Khan','Profile photo update','3 weeks ago','Exact Match',92],['Facebook','S. Khan Photography','Album: Summer trip','2 months ago','Similar Image',78],['Facebook','Sarah K.','Shared a memory from 2021','1 year ago','Partial Match',64],
['LinkedIn','Sarah Khan – Software Engineer','Excited to join a new team!','1 month ago','Exact Match',88],['LinkedIn','Sarah K. | Product Design','Speaking at DesignConf','4 months ago','Partial Match',69]];
export const ALL:Result[]=rows.map((r,i)=>({id:'r'+(i+1),platform:r[0],user:r[1],caption:r[2],date:r[3],match:r[4],conf:r[5],img:avatar(i),url:null}));
export const FAQS:[string,string][]=[
['How is PhotoTrace AI intended to work?','Once a backend is connected, you would upload a photo or enter a name and the service would look through authorized, available public sources. This site is a frontend demo using sample data.'],
['Do I need an account?','No. Guests can search freely. Accounts are optional and only add things like saved history.'],
['Which platforms are supported?','TikTok, Instagram, Facebook and LinkedIn are the planned platforms.'],
['Photo Search vs Name Search?','Photo Search compares an image to public images. Name Search looks up a name or username. Matching names can belong to different people.'],
['How accurate are matches?','No result is certain. Confidence values are illustrative here, and real matching would be imperfect.'],
['What happens to uploaded images?','In this demo your image stays in your browser tab and is never uploaded or stored. A real backend would need its own retention policy.'],
['Why might a public post not appear?','Coverage depends on available, authorized sources. Not every post can be discovered.'],
['Can it access private profiles?','No. It must never access private content or bypass authentication.']];
