import io,os
os.environ.update(APP_ENV='test',SECRET_KEY='t'*40,DATABASE_URL='sqlite://',UPLOAD_DIR='/tmp/pt_test_uploads',RATE_LIMIT_IP_PER_MIN='1000',SEARCH_PROVIDER='demo')
import pytest
from datetime import timedelta
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine,select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app import delivery
from app.db import get_db
from app.main import app
from app.models import Base,OtpCode,User,now
URL=os.environ.get('TEST_DATABASE_URL','sqlite://')  # set TEST_DATABASE_URL to run the suite on PostgreSQL
eng=create_engine(URL,poolclass=StaticPool,connect_args={'check_same_thread':False}) if URL.startswith('sqlite') else create_engine(URL);S=sessionmaker(bind=eng,expire_on_commit=False)
def _db():
    d=S()
    try: yield d
    finally: d.close()
app.dependency_overrides[get_db]=_db
@pytest.fixture(autouse=True)
def fresh():
    Base.metadata.drop_all(eng);Base.metadata.create_all(eng);delivery.TEST_OUTBOX.clear();yield
@pytest.fixture
def c(): return TestClient(app)
P='/api/v1'
def code(): return delivery.TEST_OUTBOX[-1]['code']
def reg(c,**o):
    b={'full_name':'Ada Lovelace','email':'ada@example.com','date_of_birth':'1990-05-01','country':'GB'};b.update(o)
    if 'phone' in o: b.pop('email',None)
    return c.post(P+'/auth/register/start',json=b)
def signup(c,ident='ada@example.com',**o):
    assert reg(c,**o).status_code==202
    r=c.post(P+'/auth/register/verify',json={'identifier':ident,'code':code()});assert r.status_code==200,r.text;return r.json()
def hdr(j): return {'X-CSRF-Token':j['csrf_token']}
def test_register_email_and_verify(c):
    j=signup(c);assert j['user']['email']=='ada@example.com' and j['user']['is_verified'];assert 'date_of_birth' not in str(j)
    assert c.get(P+'/auth/me').status_code==200
def test_register_phone(c):
    j=signup(c,'+1 (415) 555-0123',phone='+1 (415) 555-0123');assert j['user']['phone']=='+14155550123'
def test_unverified_cannot_login_or_see_me(c):
    reg(c);assert c.get(P+'/auth/me').status_code==401
    assert c.post(P+'/auth/login/start',json={'identifier':'ada@example.com'}).status_code==202
    assert len(delivery.TEST_OUTBOX)==1  # only the register code; nothing sent for the unverified account
def test_wrong_code_and_attempt_limit(c):
    reg(c);real=code();bad='000000' if real!='000000' else '111111'
    for _ in range(5): assert c.post(P+'/auth/register/verify',json={'identifier':'ada@example.com','code':bad}).status_code==400
    assert c.post(P+'/auth/register/verify',json={'identifier':'ada@example.com','code':real}).status_code==400  # locked out
def test_expired_and_reuse(c):
    reg(c);cd=code()
    with S() as d:
        o=d.scalar(select(OtpCode));o.expires_at=now()-timedelta(seconds=1);d.commit()
    assert c.post(P+'/auth/register/verify',json={'identifier':'ada@example.com','code':cd}).status_code==400
    with S() as d: d.query(OtpCode).delete();d.commit()
    signup(c);r=c.post(P+'/auth/register/verify',json={'identifier':'ada@example.com','code':code()});assert r.status_code==400  # reuse
def test_resend_cooldown(c):
    reg(c);r=reg(c);assert r.status_code==429 and 'Retry-After' in r.headers
def test_otp_stored_hashed(c):
    reg(c)
    with S() as d: assert code() not in d.scalar(select(OtpCode)).code_hash
def test_login_email_phone_invalid_and_logout(c):
    signup(c);c.cookies.clear();delivery.TEST_OUTBOX.clear()
    with S() as d: d.query(OtpCode).delete();d.commit()
    assert c.post(P+'/auth/login/start',json={'identifier':'ADA@example.com'}).status_code==202
    assert c.post(P+'/auth/login/verify',json={'identifier':'ada@example.com','code':'123456' if code()!='123456' else '654321'}).status_code==400
    r=c.post(P+'/auth/login/verify',json={'identifier':'ada@example.com','code':code()});assert r.status_code==200
    assert c.post(P+'/auth/logout').status_code==403  # CSRF required
    assert c.post(P+'/auth/logout',headers=hdr(r.json())).status_code==200;assert c.get(P+'/auth/me').status_code==401
def test_login_phone_and_no_account_disclosure(c):
    signup(c,'+14155550123',phone='+14155550123');c.cookies.clear()
    with S() as d: d.query(OtpCode).delete();d.commit()
    assert c.post(P+'/auth/login/start',json={'identifier':'+14155550123'}).status_code==202 and delivery.TEST_OUTBOX[-1]['channel']=='sms'
    n=len(delivery.TEST_OUTBOX);r=c.post(P+'/auth/login/start',json={'identifier':'nobody@example.com'});assert r.status_code==202 and len(delivery.TEST_OUTBOX)==n
    assert c.post(P+'/auth/login/verify',json={'identifier':'nobody@example.com','code':'123456'}).status_code==400
def test_profile_edit_partial_and_url_validation(c):
    j=signup(c);h=hdr(j)
    assert c.patch(P+'/profile',json={'bio':'Hello','instagram_url':'https://instagram.com/ada'},headers=h).status_code==200
    r=c.patch(P+'/profile',json={'tiktok_url':'https://tiktok.com/@ada'},headers=h).json();assert r['bio']=='Hello' and r['instagram_url'] and r['tiktok_url']  # preserved
    assert c.patch(P+'/profile',json={'facebook_url':'https://evil.com/x'},headers=h).status_code==422
    assert c.patch(P+'/profile',json={'linkedin_url':'http://linkedin.com/in/x'},headers=h).status_code==422
    assert c.patch(P+'/profile',json={'bio':'x'*281},headers=h).status_code==422
    assert c.patch(P+'/profile',json={'is_verified':False},headers=h).status_code==422  # mass assignment blocked
    assert c.patch(P+'/profile',json={'instagram_url':''},headers=h).json()['instagram_url'] is None
def test_photo_upload_validation(c):
    h=hdr(signup(c));b=io.BytesIO();Image.new('RGB',(40,40),'red').save(b,'PNG')
    assert c.post(P+'/profile/photo',files={'file':('a.png',b.getvalue(),'image/png')},headers=h).json()['has_photo']
    assert c.get(P+'/profile/photo').status_code==200
    assert c.post(P+'/profile/photo',files={'file':('a.png',b'not an image','image/png')},headers=h).status_code==400
def test_unauthorized(c):
    assert c.get(P+'/profile').status_code==401 and c.patch(P+'/profile',json={'bio':'x'}).status_code==401 and c.delete(P+'/account').status_code==401
def test_delete_account(c):
    j=signup(c);assert c.delete(P+'/account',headers=hdr(j)).status_code==200
    with S() as d: assert d.scalar(select(User)) is None
    assert c.get(P+'/auth/me').status_code==401
def test_db_constraints(c):
    with S() as d:
        d.add(User(email='a@x.com',full_name='A B',date_of_birth=now().date(),country='GB'));d.commit()
        d.add(User(email='a@x.com',full_name='C D',date_of_birth=now().date(),country='GB'))
        with pytest.raises(IntegrityError): d.commit()
        d.rollback();d.add(User(full_name='No Contact',date_of_birth=now().date(),country='GB'))
        with pytest.raises(IntegrityError): d.commit()
def test_validation(c):
    assert reg(c,date_of_birth='2020-01-01').status_code==422 and reg(c,country='Narnia').status_code==422
    assert c.post(P+'/auth/register/start',json={'full_name':'A B','email':'a@x.com','phone':'+14155550123','date_of_birth':'1990-01-01','country':'GB'}).status_code==422
def test_existing_account_response_identical_and_nothing_sent(c):
    first=reg(c).json();assert c.post(P+'/auth/register/verify',json={'identifier':'ada@example.com','code':code()}).status_code==200
    n=len(delivery.TEST_OUTBOX);second=reg(c);assert second.status_code==202 and len(delivery.TEST_OUTBOX)==n
    assert set(second.json())==set(first) and second.json()['contact_masked']==first['contact_masked']
