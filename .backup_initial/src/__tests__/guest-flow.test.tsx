import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import App from '../App';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();window.scrollTo=vi.fn();vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}unobserve(){}});vi.stubGlobal('matchMedia',(q:string)=>({matches:false,media:q,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"detail":"no"}',{status:401})))});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
describe('guest journey (demo data only)',()=>{
 it('Name Search validates, searches, shows labelled demo results, saves one and finds it in History',async()=>{
  window.location.hash='#/search/name';render(<App/>);const input=await screen.findByLabelText('Name or username');const form=input.closest('form')!;
  fireEvent.submit(form);expect((await screen.findByRole('alert')).textContent).toMatch(/enter a name or username/);
  fireEvent.click(screen.getByRole('button',{name:'sarah khan'}));expect((input as HTMLInputElement).value).toBe('sarah khan');
  fireEvent.click(screen.getByRole('button',{name:/^TikTok/}));expect(screen.getByText('3 of 4 selected')).toBeTruthy();
  fireEvent.submit(form);
  expect(await screen.findByRole('heading',{name:'Search Results'},{timeout:6000})).toBeTruthy();
  expect(await screen.findByText(/not real discoveries/,{},{timeout:6000})).toBeTruthy();
  const saves=await screen.findAllByRole('button',{name:/^Save /},{timeout:6000});expect(saves.length).toBe(9);// Instagram 4 + Facebook 3 + LinkedIn 2 (TikTok deselected)
  expect(screen.getAllByText('Demo Result').length).toBe(9);
  fireEvent.click(saves[0]);expect(await screen.findByText(/Saved\. View it/)).toBeTruthy();
  window.location.hash='#/history';expect(await screen.findByText('“sarah khan”',{},{timeout:4000})).toBeTruthy();
  fireEvent.click(screen.getByRole('tab',{name:/Saved Results/}));expect((await screen.findAllByText('Demo Result')).length).toBe(1)},20000);
 it('Photo Search rejects unsupported files, keeps Search disabled, and toggles platforms',async()=>{
  window.location.hash='#/search/photo';render(<App/>);const file=await screen.findByLabelText('Choose image');
  expect((screen.getByRole('button',{name:/Search Across Platforms/}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(file,{target:{files:[new File(['x'],'a.gif',{type:'image/gif'})]}});expect((await screen.findByRole('alert')).textContent).toMatch(/not supported/);
  fireEvent.click(screen.getByRole('button',{name:'Clear all'}));expect(screen.getByText('0 of 4 selected')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Select all'}));expect(screen.getByText('4 of 4 selected')).toBeTruthy()});
 it('unknown routes redirect to the homepage',async()=>{window.location.hash='#/nope';render(<App/>);expect((await screen.findAllByRole('heading',{name:/Find Where a Photo/})).length).toBeGreaterThan(0)});
});
