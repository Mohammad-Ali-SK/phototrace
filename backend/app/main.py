import hmac,io,os,secrets
from datetime import timedelta
from typing import Literal,Optional
from fastapi import Form,Query,APIRouter,Depends,FastAPI,File,HTTPException,Request,Response,UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from sqlalchemy import delete,func,or_,select
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .delivery import DeliveryError,send_code
from .models import SearchHistory,SavedResult,AuthSession,OtpCode,Profile,RateEvent,User,now
from .schemas import HistoryIn,SavedIn,Identifier,ProfileUpdate,RegisterStart,VerifyCode,Visibility,NameSearchIn
from .security import generate_otp,hash_otp,mask,normalize_contact,sha256
from .services.search import get_search_provider,get_provider_status,get_cached_result
settings.validate()
app=FastAPI(title='PhotoTrace AI API',version='1.0.0',description='Passwordless (OTP) authentication and profile API. Interactive docs at /docs.')
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins,allow_credentials=True,allow_methods=['GET','POST','PATCH','DELETE'],allow_headers=['Content-Type','X-CSRF-Token'])
@app.middleware('http')
async def sec_headers(request:Request,call_next):
    r=await call_next(request);r.headers['X-Content-Type-Options']='nosniff';r.headers['Cache-Control']='no-store';return r
api=APIRouter(prefix='/api/v1')
GENERIC='If the details are valid, a verification code has been sent.'
BAD='Invalid or expired code.'
def err(status,msg,**h): raise HTTPException(status,msg,headers=h or None)
def hit(db:Session,key:str,limit:int,window:int):
    n=db.scalar(select(func.count(RateEvent.id)).where(RateEvent.key==key,RateEvent.created_at>now()-timedelta(seconds=window)))
    if n>=limit: err(429,'Too many requests. Please try again later.',**{'Retry-After':str(window)})
    db.add(RateEvent(key=key));db.commit()
def ip_limit(request:Request,db:Session=Depends(get_db)):
    hit(db,f'ip:{request.client.host if request.client else "?"}:{request.url.path}',settings.rate_ip,60)
def issue_otp(db:Session,contact:str,channel:str,purpose:str):
    db.execute(delete(OtpCode).where(OtpCode.expires_at<now()-timedelta(days=1)))
    last=db.scalar(select(OtpCode).where(OtpCode.contact==contact,OtpCode.purpose==purpose).order_by(OtpCode.created_at.desc()))
    if last:
        wait=settings.cooldown-int((now()-last.created_at).total_seconds())
        if wait>0: err(429,f'Please wait {wait} seconds before requesting another code.',**{'Retry-After':str(wait)})
    hit(db,f'contact:{contact}:otp',settings.contact_per_hour,3600)
    db.execute(delete(OtpCode).where(OtpCode.contact==contact,OtpCode.purpose==purpose,OtpCode.consumed==False))  # noqa: E712 invalidate older codes
    code=generate_otp();rec=OtpCode(contact=contact,purpose=purpose,code_hash=hash_otp(contact,purpose,code),expires_at=now()+timedelta(seconds=settings.otp_ttl))
    db.add(rec);db.commit()
    try: send_code(channel,contact,code,purpose)
    except DeliveryError:
        db.delete(rec);db.commit();err(503,'We could not send the verification code right now. Please try again later.')
def check_otp(db:Session,contact:str,purpose:str,code:str):
    o=db.scalar(select(OtpCode).where(OtpCode.contact==contact,OtpCode.purpose==purpose,OtpCode.consumed==False).order_by(OtpCode.created_at.desc()))  # noqa: E712
    if not o or o.expires_at<now() or o.attempts>=settings.otp_max_attempts: err(400,BAD)
    o.attempts+=1
    if not hmac.compare_digest(o.code_hash,hash_otp(contact,purpose,code)): db.commit();err(400,BAD)
    o.consumed=True;db.commit()
def user_out(u:User)->dict:
    p=u.profile
    return {'id':u.id,'full_name':u.full_name,'email':u.email,'phone':u.phone,'country':u.country,'is_verified':u.is_verified,'profile':prof_out(p) if p else None}
def prof_out(p:Profile)->dict:
    return {'bio':p.bio,'instagram_url':p.instagram_url,'tiktok_url':p.tiktok_url,'facebook_url':p.facebook_url,'linkedin_url':p.linkedin_url,'has_photo':bool(p.photo_file),'is_public':p.is_public,'show_bio':p.show_bio,'show_social_links':p.show_social_links}
def start_session(db:Session,u:User,resp:Response)->dict:
    tok=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(24)
    db.add(AuthSession(id=sha256(tok),user_id=u.id,csrf_token=csrf,expires_at=now()+timedelta(seconds=settings.session_ttl)));db.commit()
    resp.set_cookie('pt_session',tok,max_age=settings.session_ttl,httponly=True,secure=settings.cookie_secure,samesite=settings.cookie_samesite,path='/')
    return {'user':user_out(u),'csrf_token':csrf}
def current(request:Request,db:Session=Depends(get_db))->tuple[User,AuthSession]:
    tok=request.cookies.get('pt_session');s=db.get(AuthSession,sha256(tok)) if tok else None
    if not s or s.revoked_at or s.expires_at<now(): err(401,'Not authenticated.')
    u=db.get(User,s.user_id)
    if not u or not u.is_verified or u.status!='active': err(401,'Not authenticated.')
    return u,s
def current_csrf(request:Request,ctx=Depends(current)):
    if not hmac.compare_digest(request.headers.get('X-CSRF-Token',''),ctx[1].csrf_token): err(403,'Invalid CSRF token.')
    return ctx
@api.post('/auth/register/start',status_code=202,dependencies=[Depends(ip_limit)])
def register_start(b:RegisterStart,db:Session=Depends(get_db)):
    channel,contact=('email',b.email) if b.email else ('sms',b.phone)
    u=db.scalar(select(User).where(or_(User.email==b.email,User.phone==b.phone) if b.email and b.phone else (User.email==b.email if b.email else User.phone==b.phone)))
    if u and u.is_verified: return {'message':GENERIC,'contact_masked':mask(contact),'expires_in':settings.otp_ttl,'resend_after':settings.cooldown}  # identical shape: no account disclosure
    if not u: u=User(email=b.email,phone=b.phone,full_name=b.full_name,date_of_birth=b.date_of_birth,country=b.country)
    else: u.full_name,u.date_of_birth,u.country=b.full_name,b.date_of_birth,b.country
    db.add(u);db.commit()
    issue_otp(db,contact,channel,'register')
    return {'message':GENERIC,'contact_masked':mask(contact),'expires_in':settings.otp_ttl,'resend_after':settings.cooldown}
@api.post('/auth/register/verify',dependencies=[Depends(ip_limit)])
def register_verify(b:VerifyCode,resp:Response,db:Session=Depends(get_db)):
    try: ch,contact=normalize_contact(b.identifier)
    except ValueError: err(400,BAD)
    check_otp(db,contact,'register',b.code)
    u=db.scalar(select(User).where(User.email==contact if ch=='email' else User.phone==contact))
    if not u: err(400,BAD)
    u.is_verified=True;u.status='active'
    if not u.profile: db.add(Profile(user_id=u.id))
    db.commit();db.refresh(u)
    return start_session(db,u,resp)
@api.post('/auth/login/start',status_code=202,dependencies=[Depends(ip_limit)])
def login_start(b:Identifier,db:Session=Depends(get_db)):
    try: ch,contact=normalize_contact(b.identifier)
    except ValueError as e: err(422,str(e))
    u=db.scalar(select(User).where(User.email==contact if ch=='email' else User.phone==contact))
    if u and u.is_verified and u.status=='active': issue_otp(db,contact,ch,'login')
    return {'message':GENERIC,'resend_after':settings.cooldown,'expires_in':settings.otp_ttl}
@api.post('/auth/login/verify',dependencies=[Depends(ip_limit)])
def login_verify(b:VerifyCode,resp:Response,db:Session=Depends(get_db)):
    try: ch,contact=normalize_contact(b.identifier)
    except ValueError: err(400,BAD)
    u=db.scalar(select(User).where(User.email==contact if ch=='email' else User.phone==contact))
    if not u or not u.is_verified: err(400,BAD)
    check_otp(db,contact,'login',b.code)
    return start_session(db,u,resp)
@api.post('/auth/logout')
def logout(resp:Response,ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    ctx[1].revoked_at=now();db.commit();resp.delete_cookie('pt_session',path='/');return {'message':'Logged out.'}
@api.get('/auth/me')
def me(ctx=Depends(current)): return {'user':user_out(ctx[0]),'csrf_token':ctx[1].csrf_token}
@api.get('/profile')
def get_profile(ctx=Depends(current)): return prof_out(ctx[0].profile)
@api.patch('/profile')
def patch_profile(b:ProfileUpdate,ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    for k,v in b.model_dump(exclude_unset=True).items(): setattr(ctx[0].profile,k,v)  # only supplied fields change
    db.commit();return prof_out(ctx[0].profile)
@api.patch('/profile/visibility')
def patch_vis(b:Visibility,ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    for k,v in b.model_dump(exclude_unset=True,exclude_none=True).items(): setattr(ctx[0].profile,k,v)
    db.commit();return prof_out(ctx[0].profile)
def _rm_photo(p:Profile):
    if p.photo_file:
        try: os.remove(os.path.join(settings.upload_dir,p.photo_file))
        except OSError: pass
        p.photo_file=None
@api.post('/profile/photo')
async def upload_photo(file:UploadFile=File(...),ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    raw=await file.read(2*1024*1024+1)
    if len(raw)>2*1024*1024: err(413,'Image must be 2 MB or smaller.')
    try:
        im=Image.open(io.BytesIO(raw));fmt=im.format;im.verify();im=Image.open(io.BytesIO(raw))
        if fmt not in ('JPEG','PNG','WEBP') or im.width*im.height>25_000_000: raise ValueError
        im=im.convert('RGB');im.thumbnail((512,512))
    except Exception: err(400,'Upload a valid JPG, PNG or WEBP image.')
    os.makedirs(settings.upload_dir,exist_ok=True);name=secrets.token_hex(16)+'.jpg'  # re-encoded: strips metadata and any embedded payload
    im.save(os.path.join(settings.upload_dir,name),'JPEG',quality=88)
    _rm_photo(ctx[0].profile);ctx[0].profile.photo_file=name;db.commit();return prof_out(ctx[0].profile)
@api.delete('/profile/photo')
def delete_photo(ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    _rm_photo(ctx[0].profile);db.commit();return prof_out(ctx[0].profile)
@api.get('/profile/photo')
def get_photo(ctx=Depends(current)):
    f=ctx[0].profile.photo_file
    if not f: err(404,'No profile photo.')
    return FileResponse(os.path.join(settings.upload_dir,f),media_type='image/jpeg',headers={'Cache-Control':'private, max-age=60'})
@api.delete('/account')
def delete_account(resp:Response,ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    u=ctx[0];_rm_photo(u.profile)
    db.execute(delete(SearchHistory).where(SearchHistory.user_id==u.id));db.execute(delete(SavedResult).where(SavedResult.user_id==u.id));db.execute(delete(OtpCode).where(OtpCode.contact.in_([c for c in (u.email,u.phone) if c])));db.delete(u);db.commit()
    resp.delete_cookie('pt_session',path='/');return {'message':'Your account and personal data were deleted.'}
def hist_out(h:SearchHistory)->dict:
    return {'id':h.id,'type':h.type,'query':h.query,'thumb':h.thumb,'platforms':h.platforms.split(','),'result_count':h.result_count,'status':h.status,'created_at':h.created_at.isoformat()+'Z'}
def saved_out(r:SavedResult)->dict:
    return {'result_key':r.result_key,'platform':r.platform,'account':r.account,'caption':r.caption,'match_type':r.match_type,'source_url':r.source_url,'saved_at':r.saved_at.isoformat()+'Z'}
@api.get('/history')
def list_history(type:Optional[Literal['photo','name']]=None,sort:Literal['newest','oldest']='newest',ctx=Depends(current),db:Session=Depends(get_db)):
    q=select(SearchHistory).where(SearchHistory.user_id==ctx[0].id)  # always scoped to the caller
    if type: q=q.where(SearchHistory.type==type)
    q=q.order_by(SearchHistory.created_at.desc() if sort=='newest' else SearchHistory.created_at.asc()).limit(100)
    return [hist_out(h) for h in db.scalars(q)]
@api.post('/history',status_code=201)
def add_history(b:HistoryIn,ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    h=SearchHistory(user_id=ctx[0].id,type=b.type,query=b.query.strip(),thumb=b.thumb if b.type=='photo' else None,platforms=','.join(b.platforms),result_count=b.result_count,status=b.status)
    db.add(h);db.commit()
    old=db.scalars(select(SearchHistory.id).where(SearchHistory.user_id==ctx[0].id).order_by(SearchHistory.created_at.desc()).offset(100)).all()
    if old: db.execute(delete(SearchHistory).where(SearchHistory.id.in_(old)));db.commit()  # keep the newest 100
    return hist_out(h)
@api.delete('/history/{hid}')
def delete_history(hid:str,ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    h=db.scalar(select(SearchHistory).where(SearchHistory.id==hid,SearchHistory.user_id==ctx[0].id))
    if not h: err(404,'History entry not found.')
    db.delete(h);db.commit();return {'message':'Deleted.'}
@api.delete('/history')
def clear_history(ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    db.execute(delete(SearchHistory).where(SearchHistory.user_id==ctx[0].id));db.commit();return {'message':'History cleared.'}
@api.get('/saved')
def list_saved(ctx=Depends(current),db:Session=Depends(get_db)):
    return [saved_out(r) for r in db.scalars(select(SavedResult).where(SavedResult.user_id==ctx[0].id).order_by(SavedResult.saved_at.desc()).limit(500))]
@api.post('/saved',status_code=201)
def add_saved(b:SavedIn,ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    r=db.scalar(select(SavedResult).where(SavedResult.user_id==ctx[0].id,SavedResult.result_key==b.result_key))
    if not r: r=SavedResult(user_id=ctx[0].id,**b.model_dump());db.add(r);db.commit()  # idempotent
    return saved_out(r)
@api.delete('/saved/{key}')
def remove_saved(key:str,ctx=Depends(current_csrf),db:Session=Depends(get_db)):
    r=db.scalar(select(SavedResult).where(SavedResult.user_id==ctx[0].id,SavedResult.result_key==key))
    if not r: err(404,'Saved result not found.')
    db.delete(r);db.commit();return {'message':'Removed.'}
@api.get('/search/providers')
def search_providers():
    return get_provider_status()
@api.post('/search/name')
async def search_name(b:NameSearchIn):
    provider=get_search_provider()
    try:
        res=await provider.search_name(b.query,b.platforms)
        return res.model_dump(by_alias=True)
    except Exception as e:
        msg = str(e).strip() or "Search service encountered an error. Please try again."
        err(503, msg)
@api.post('/search/photo')
async def search_photo(
    file: Optional[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None),
    platforms: str = Form(...),
    is_sample: Optional[str] = Form(None),
    name: Optional[str] = Form(None),
):
    target = file or image
    if not target:
        err(400, 'Please provide an image file.')
    raw = await target.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        err(413, 'Image must be 10 MB or smaller.')
    try:
        im = Image.open(io.BytesIO(raw))
        fmt = im.format
        im.verify()
        if fmt not in ('JPEG', 'PNG', 'WEBP'):
            raise ValueError
    except Exception:
        err(400, 'Upload a valid JPG, PNG or WEBP image.')
    valid_plats = {'tiktok', 'instagram', 'facebook', 'linkedin'}
    plat_list = [p.strip().lower() for p in platforms.split(',') if p.strip().lower() in valid_plats]
    if not plat_list:
        err(400, 'Select at least one valid platform.')
    is_sample_bool = (is_sample or '').strip().lower() in ('true', '1', 'yes')
    name_clean = (name or '').strip() or None
    provider = get_search_provider()
    try:
        res = await provider.search_photo(
            raw,
            target.filename or 'upload.jpg',
            plat_list,
            is_sample=is_sample_bool,
            name=name_clean,
        )
        return res.model_dump(by_alias=True)
    except Exception as e:
        err(503, str(e))
@api.get('/search/results/{result_id}')
def get_result_detail(result_id:str):
    res=get_cached_result(result_id)
    if not res:
        err(404,'Search result not found.')
    return res.model_dump(by_alias=True)
@api.get('/health')
def health(): return {'status':'ok'}
app.include_router(api)
