import re
from datetime import date
from typing import Literal, Optional
from urllib.parse import urlparse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from .security import normalize_email, normalize_phone
class RegisterStart(BaseModel):
    model_config=ConfigDict(extra='forbid')
    full_name:str=Field(min_length=2,max_length=100);email:Optional[str]=None;phone:Optional[str]=None
    date_of_birth:date;country:str
    @field_validator('full_name')
    @classmethod
    def _n(cls,v):
        v=' '.join(v.split())
        if len(v)<2: raise ValueError('Enter your full name')
        return v
    @field_validator('country')
    @classmethod
    def _c(cls,v):
        v=v.strip().upper()
        if not re.fullmatch(r'[A-Z]{2}',v): raise ValueError('Choose a country')
        return v
    @field_validator('date_of_birth')
    @classmethod
    def _d(cls,v):
        t=date.today();age=t.year-v.year-((t.month,t.day)<(v.month,v.day))
        if age<13 or age>120: raise ValueError('You must be at least 13 years old to register')
        return v
    @model_validator(mode='after')
    def _one(self):
        if bool(self.email)==bool(self.phone): raise ValueError('Provide either an email address or a phone number')
        if self.email: self.email=normalize_email(self.email)
        if self.phone: self.phone=normalize_phone(self.phone)
        return self
class Identifier(BaseModel):
    model_config=ConfigDict(extra='forbid');identifier:str=Field(min_length=3,max_length=254)
class VerifyCode(Identifier):
    code:str=Field(pattern=r'^\d{6}$')
HOSTS={'instagram_url':('instagram.com',),'tiktok_url':('tiktok.com',),'facebook_url':('facebook.com','fb.com'),'linkedin_url':('linkedin.com',)}
class ProfileUpdate(BaseModel):
    model_config=ConfigDict(extra='forbid')  # blocks mass assignment of any other field
    bio:Optional[str]=Field(default=None,max_length=280)
    instagram_url:Optional[str]=None;tiktok_url:Optional[str]=None;facebook_url:Optional[str]=None;linkedin_url:Optional[str]=None
    @field_validator('bio')
    @classmethod
    def _b(cls,v): return (v.strip() or None) if v else None
    @field_validator('instagram_url','tiktok_url','facebook_url','linkedin_url')
    @classmethod
    def _u(cls,v,info):
        if not v or not v.strip(): return None
        v=v.strip()
        if len(v)>200: raise ValueError('URL is too long')
        p=urlparse(v);h=(p.hostname or '').lower()
        if p.scheme!='https' or not any(h==d or h.endswith('.'+d) for d in HOSTS[info.field_name]): raise ValueError(f'Enter a valid https link on {HOSTS[info.field_name][0]}')
        return v
class Visibility(BaseModel):
    model_config=ConfigDict(extra='forbid');is_public:Optional[bool]=None;show_bio:Optional[bool]=None;show_social_links:Optional[bool]=None

PLAT=Literal['tiktok','instagram','facebook','linkedin']
class HistoryIn(BaseModel):
    model_config=ConfigDict(extra='forbid')
    type:Literal['photo','name'];query:str=Field(min_length=1,max_length=200);thumb:Optional[str]=Field(default=None,max_length=60000)
    platforms:list[PLAT]=Field(min_length=1,max_length=4);result_count:int=Field(ge=0,le=1000);status:Literal['completed','empty','failed']
    @field_validator('thumb')
    @classmethod
    def _t(cls,v):
        if v and not v.startswith('data:image/jpeg;base64,'): raise ValueError('Thumbnail must be a JPEG data URL')
        return v or None
class SavedIn(BaseModel):
    model_config=ConfigDict(extra='forbid')
    result_key:str=Field(pattern=r'^[A-Za-z0-9_-]{1,64}$');platform:PLAT;account:Optional[str]=Field(default=None,max_length=200)
    caption:Optional[str]=Field(default=None,max_length=300);match_type:Optional[str]=Field(default=None,max_length=40);source_url:Optional[str]=Field(default=None,max_length=500)
    @field_validator('source_url')
    @classmethod
    def _s(cls,v):
        if not v: return None
        p=urlparse(v)
        if p.scheme!='https' or not p.hostname: raise ValueError('Source URL must be a valid https link')
        return v
class NameSearchIn(BaseModel):
    model_config=ConfigDict(extra='forbid')
    query:str=Field(min_length=1,max_length=100)
    platforms:list[PLAT]=Field(min_length=1,max_length=4)

