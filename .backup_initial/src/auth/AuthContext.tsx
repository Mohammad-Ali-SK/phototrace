import {createContext,useContext,useEffect,useState,ReactNode} from 'react';import {Navigate,useLocation} from 'react-router-dom';
import {api,setCsrf,AppUser,Session} from '../services/api';
interface A{user:AppUser|null;loading:boolean;photoV:number;setSession:(s:Session)=>void;setUser:(u:AppUser|null)=>void;logout:()=>Promise<void>;bumpPhoto:()=>void}
const Ctx=createContext<A>(null as unknown as A);export const useAuth=()=>useContext(Ctx);
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<AppUser|null>(null);const [loading,setLoading]=useState(true);const [photoV,setV]=useState(1);
 useEffect(()=>{api.me().then(s=>{setCsrf(s.csrf_token);setUser(s.user)}).catch(()=>setUser(null)).finally(()=>setLoading(false))},[]);
 const setSession=(s:Session)=>{setCsrf(s.csrf_token);setUser(s.user)};
 const logout=async()=>{try{await api.logout()}finally{setCsrf('');setUser(null)}};
 return <Ctx.Provider value={{user,loading,photoV,setSession,setUser,logout,bumpPhoto:()=>setV(v=>v+1)}}>{children}</Ctx.Provider>}
export function RequireAuth({children}:{children:(u:AppUser)=>ReactNode}){const {user,loading}=useAuth();const loc=useLocation();
 if(loading)return <div className="grid min-h-[60vh] place-items-center text-slate-500" role="status">Loading…</div>;
 return user?<>{children(user)}</>:<Navigate to="/login" replace state={{from:loc.pathname}}/>}
