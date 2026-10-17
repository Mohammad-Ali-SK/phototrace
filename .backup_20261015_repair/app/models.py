import uuid
from datetime import datetime, date, timezone
from typing import Optional
from sqlalchemy import Text, UniqueConstraint, String, Date, DateTime, Boolean, Integer, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
def now()->datetime: return datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC everywhere
class Base(DeclarativeBase): pass
def uid(): return str(uuid.uuid4())
class User(Base):
    __tablename__='users'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    email: Mapped[Optional[str]]=mapped_column(String(254),unique=True)
    phone: Mapped[Optional[str]]=mapped_column(String(16),unique=True)
    full_name: Mapped[str]=mapped_column(String(100))
    date_of_birth: Mapped[date]=mapped_column(Date)  # private: never returned by the API
    country: Mapped[str]=mapped_column(String(2))
    is_verified: Mapped[bool]=mapped_column(Boolean,default=False)
    status: Mapped[str]=mapped_column(String(10),default='pending')
    created_at: Mapped[datetime]=mapped_column(DateTime,default=now)
    updated_at: Mapped[datetime]=mapped_column(DateTime,default=now,onupdate=now)
    profile: Mapped[Optional['Profile']]=relationship(back_populates='user',cascade='all, delete-orphan',uselist=False,passive_deletes=True)
    sessions: Mapped[list['AuthSession']]=relationship(cascade='all, delete-orphan',passive_deletes=True)
    __table_args__=(CheckConstraint('email IS NOT NULL OR phone IS NOT NULL',name='ck_user_contact'),CheckConstraint("status IN ('pending','active')",name='ck_user_status'))
class Profile(Base):
    __tablename__='profiles'
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),primary_key=True)
    photo_file: Mapped[Optional[str]]=mapped_column(String(64))
    bio: Mapped[Optional[str]]=mapped_column(String(280))
    instagram_url: Mapped[Optional[str]]=mapped_column(String(200))
    tiktok_url: Mapped[Optional[str]]=mapped_column(String(200))
    facebook_url: Mapped[Optional[str]]=mapped_column(String(200))
    linkedin_url: Mapped[Optional[str]]=mapped_column(String(200))
    is_public: Mapped[bool]=mapped_column(Boolean,default=False)
    show_bio: Mapped[bool]=mapped_column(Boolean,default=False)
    show_social_links: Mapped[bool]=mapped_column(Boolean,default=False)
    user: Mapped[User]=relationship(back_populates='profile')
class OtpCode(Base):
    __tablename__='otp_codes'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    contact: Mapped[str]=mapped_column(String(254))
    purpose: Mapped[str]=mapped_column(String(10))
    code_hash: Mapped[str]=mapped_column(String(64))  # HMAC-SHA256, never the code itself
    expires_at: Mapped[datetime]=mapped_column(DateTime)
    attempts: Mapped[int]=mapped_column(Integer,default=0)
    consumed: Mapped[bool]=mapped_column(Boolean,default=False)
    created_at: Mapped[datetime]=mapped_column(DateTime,default=now)
    __table_args__=(Index('ix_otp_contact_purpose','contact','purpose'),)
class AuthSession(Base):
    __tablename__='auth_sessions'
    id: Mapped[str]=mapped_column(String(64),primary_key=True)  # SHA-256 of the cookie token
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    csrf_token: Mapped[str]=mapped_column(String(64))
    created_at: Mapped[datetime]=mapped_column(DateTime,default=now)
    expires_at: Mapped[datetime]=mapped_column(DateTime)
    revoked_at: Mapped[Optional[datetime]]=mapped_column(DateTime)
class RateEvent(Base):
    __tablename__='rate_events'
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    key: Mapped[str]=mapped_column(String(300))
    created_at: Mapped[datetime]=mapped_column(DateTime,default=now)
    __table_args__=(Index('ix_rate_key_time','key','created_at'),)

class SearchHistory(Base):
    __tablename__='search_history'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'))
    type: Mapped[str]=mapped_column(String(5))
    query: Mapped[str]=mapped_column(String(200))
    thumb: Mapped[Optional[str]]=mapped_column(Text)  # small JPEG data URL for photo searches (user's own data, deleted with the account)
    platforms: Mapped[str]=mapped_column(String(60))
    result_count: Mapped[int]=mapped_column(Integer,default=0)
    status: Mapped[str]=mapped_column(String(10))
    created_at: Mapped[datetime]=mapped_column(DateTime,default=now)
    __table_args__=(CheckConstraint("type IN ('photo','name')",name='ck_hist_type'),CheckConstraint("status IN ('completed','empty','failed')",name='ck_hist_status'),Index('ix_hist_user_created','user_id','created_at'))
class SavedResult(Base):
    __tablename__='saved_results'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'))
    result_key: Mapped[str]=mapped_column(String(64))
    platform: Mapped[str]=mapped_column(String(10))
    account: Mapped[Optional[str]]=mapped_column(String(200))
    caption: Mapped[Optional[str]]=mapped_column(String(300))
    match_type: Mapped[Optional[str]]=mapped_column(String(40))
    source_url: Mapped[Optional[str]]=mapped_column(String(500))
    saved_at: Mapped[datetime]=mapped_column(DateTime,default=now)
    __table_args__=(UniqueConstraint('user_id','result_key',name='uq_saved_user_key'),Index('ix_saved_user','user_id'))
