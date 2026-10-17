import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import App from '../App';
// Render smoke tests (jsdom): verify every page mounts and shows its heading for a guest. They do NOT check visual layout.
const routes:[string,RegExp|string][]=[['/',/Find Where a Photo/],['/search/photo','Photo Search'],['/search/name','Name Search'],['/results','No search to show'],['/history','Search History'],['/login','Welcome back'],['/signup','Create your account']];
beforeEach(()=>{window.scrollTo=vi.fn();vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}unobserve(){}});
 vi.stubGlobal('matchMedia',(q:string)=>({matches:false,media:q,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({detail:'Not authenticated.'}),{status:401})))});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
describe('guest page rendering',()=>{for(const [path,h] of routes)it(`${path} renders`,async()=>{window.location.hash='#'+path;render(<App/>);
 expect((await screen.findAllByRole('heading',{name:h})).length).toBeGreaterThan(0)})});
