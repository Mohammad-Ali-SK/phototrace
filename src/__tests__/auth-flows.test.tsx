import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';
import App from '../App';
const USER={id:'1',full_name:'Ada Lovelace',email:'ada@example.com',phone:null,country:'GB',is_verified:true,profile:{bio:'Hi',instagram_url:null,tiktok_url:null,facebook_url:null,linkedin_url:null,has_photo:false,is_public:false,show_bio:false,show_social_links:false}};
const json=(b:unknown,status=200)=>new Response(JSON.stringify(b),{status});
function mock(me:object|null,extra:(url:string,init?:RequestInit)=>Response|null=()=>null){
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{const e=extra(url,init);if(e)return e;
  if(url.endsWith('/auth/me'))return me?json({user:me,csrf_token:'c'}):json({detail:'Not authenticated.'},401);return json({detail:'x'},404)}))}
const go=(h:string)=>{window.location.hash=h};
beforeEach(()=>{window.scrollTo=vi.fn()});afterEach(()=>{cleanup();vi.unstubAllGlobals()});
describe('auth guards',()=>{
 for(const path of ['/profile','/settings'])it(`logged-out ${path} redirects to login without crashing`,async()=>{mock(null);go('#'+path);render(<App/>);
  expect(await screen.findByRole('heading',{name:'Welcome back'})).toBeTruthy()});
 it('logged-in /profile renders, and again after a refresh (fresh mount)',async()=>{mock(USER);go('#/profile');const a=render(<App/>);
  expect(await screen.findByRole('heading',{name:'Ada Lovelace'})).toBeTruthy();a.unmount();render(<App/>);expect(await screen.findByRole('heading',{name:'Ada Lovelace'})).toBeTruthy()});
 it('logged-in /settings renders',async()=>{mock(USER);go('#/settings');render(<App/>);expect(await screen.findByRole('heading',{name:'Settings'})).toBeTruthy()});
 it('does not crash if the user has no profile object',async()=>{mock({...USER,profile:null});go('#/profile');render(<App/>);expect(await screen.findByRole('heading',{name:'Ada Lovelace'})).toBeTruthy()});
 it('shows a loading state, not a crash, while /auth/me is pending',async()=>{vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));go('#/profile');render(<App/>);expect(await screen.findByText('Loading…')).toBeTruthy()});
});
describe('sign-up guidance',()=>{
 it('uses neutral wording and points to Login; never claims a code was sent',async()=>{
  mock(null,(u)=>u.endsWith('/auth/register/start')?json({message:'x',contact_masked:'a***@example.com',expires_in:600,resend_after:60},202):null);go('#/signup');render(<App/>);
  fireEvent.change(await screen.findByLabelText('Full name'),{target:{value:'Ada Lovelace'}});fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'ada@example.com'}});
  fireEvent.change(screen.getByLabelText('Date of birth'),{target:{value:'1990-05-01'}});fireEvent.change(screen.getByLabelText('Country'),{target:{value:'GB'}});
  fireEvent.click(screen.getByRole('button',{name:'Send Verification Code'}));
  expect(await screen.findByText(/If a code can be sent/)).toBeTruthy();expect(screen.queryByText(/We sent/)).toBeNull();expect(screen.getByRole('link',{name:'log in instead'})).toBeTruthy()});
 it('stays on step 1 and shows the error when delivery fails (503)',async()=>{
  mock(null,(u)=>u.endsWith('/auth/register/start')?json({detail:'We could not send the verification code right now. Please try again later.'},503):null);go('#/signup');render(<App/>);
  fireEvent.change(await screen.findByLabelText('Full name'),{target:{value:'Ada Lovelace'}});fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'ada@example.com'}});
  fireEvent.change(screen.getByLabelText('Date of birth'),{target:{value:'1990-05-01'}});fireEvent.change(screen.getByLabelText('Country'),{target:{value:'GB'}});
  fireEvent.click(screen.getByRole('button',{name:'Send Verification Code'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toMatch(/could not send/));expect(screen.queryByLabelText('Verification code')).toBeNull()});
});
