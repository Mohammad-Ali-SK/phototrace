from .test_auth import c,fresh,signup,hdr,P,S  # noqa: F401 (fixtures)
from app.models import SearchHistory
from sqlalchemy import select
H={'type':'name','query':'sarah khan','platforms':['tiktok','instagram'],'result_count':5,'status':'completed'}
SV={'result_key':'d1','platform':'tiktok','account':'@sarah_diaries','caption':'x','match_type':'Similar Image'}
def other(c):
    c.cookies.clear();return signup(c,'bob@example.com',email='bob@example.com',full_name='Bob Smith')
def test_auth_required(c):
    assert c.get(P+'/history').status_code==401 and c.post(P+'/history',json=H).status_code==401 and c.get(P+'/saved').status_code==401
def test_history_crud_filter_sort_clear(c):
    h=hdr(signup(c))
    assert c.post(P+'/history',json=H).status_code==403  # CSRF
    a=c.post(P+'/history',json=H,headers=h);assert a.status_code==201
    c.post(P+'/history',json={**H,'type':'photo','query':'me.jpg','thumb':'data:image/jpeg;base64,AAAA','status':'empty','result_count':0},headers=h)
    assert len(c.get(P+'/history').json())==2 and [x['type'] for x in c.get(P+'/history?type=photo').json()]==['photo']
    assert c.get(P+'/history?sort=oldest').json()[0]['query']=='sarah khan' and c.get(P+'/history?sort=newest').json()[0]['query']=='me.jpg'
    assert c.delete(P+'/history/'+a.json()['id'],headers=h).status_code==200 and len(c.get(P+'/history').json())==1
    assert c.delete(P+'/history',headers=h).status_code==200 and c.get(P+'/history').json()==[]
def test_history_validation(c):
    h=hdr(signup(c))
    for bad in ({**H,'platforms':[]},{**H,'platforms':['myspace']},{**H,'status':'weird'},{**H,'type':'photo','thumb':'javascript:alert(1)'},{**H,'extra':1},{**H,'query':''}):
        assert c.post(P+'/history',json=bad,headers=h).status_code==422
def test_user_isolation(c):
    h=hdr(signup(c));hid=c.post(P+'/history',json=H,headers=h).json()['id'];c.post(P+'/saved',json=SV,headers=h)
    h2=hdr(other(c));assert c.get(P+'/history').json()==[] and c.get(P+'/saved').json()==[]
    assert c.delete(P+'/history/'+hid,headers=h2).status_code==404 and c.delete(P+'/saved/d1',headers=h2).status_code==404
    c.delete(P+'/history',headers=h2)
    with S() as d: assert d.scalar(select(SearchHistory)) is not None  # other user's clear didn't touch it
def test_saved_idempotent_remove_and_url(c):
    h=hdr(signup(c));assert c.post(P+'/saved',json=SV,headers=h).status_code==201;c.post(P+'/saved',json=SV,headers=h)
    assert len(c.get(P+'/saved').json())==1
    assert c.post(P+'/saved',json={**SV,'result_key':'d2','source_url':'http://x.com'},headers=h).status_code==422
    assert c.post(P+'/saved',json={**SV,'result_key':'d3','source_url':'https://example.com/p'},headers=h).status_code==201
    assert c.delete(P+'/saved/d1',headers=h).status_code==200 and len(c.get(P+'/saved').json())==1 and c.delete(P+'/saved/d1',headers=h).status_code==404
def test_account_deletion_removes_history(c):
    h=hdr(signup(c));c.post(P+'/history',json=H,headers=h);c.post(P+'/saved',json=SV,headers=h)
    assert c.delete(P+'/account',headers=h).status_code==200
    with S() as d: assert d.scalar(select(SearchHistory)) is None
