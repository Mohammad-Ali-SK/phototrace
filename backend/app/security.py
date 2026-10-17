import hashlib,hmac,re,secrets
from .config import settings
EMAIL_RE=re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');PHONE_RE=re.compile(r'^\+[1-9]\d{7,14}$')
def normalize_email(v:str)->str:
    v=v.strip().lower()
    if not EMAIL_RE.match(v) or len(v)>254: raise ValueError('Enter a valid email address')
    return v
def normalize_phone(v:str)->str:
    v=re.sub(r'[\s().-]','',v.strip())
    if not PHONE_RE.match(v): raise ValueError('Enter a phone number in international format, e.g. +14155550123')
    return v
def normalize_contact(v:str)->tuple[str,str]:
    return ('email',normalize_email(v)) if '@' in v else ('sms',normalize_phone(v))
def generate_otp()->str: return ''.join(secrets.choice('0123456789') for _ in range(6))
def hash_otp(contact:str,purpose:str,code:str)->str:
    return hmac.new(settings.secret_key.encode(),f'{purpose}:{contact}:{code}'.encode(),hashlib.sha256).hexdigest()
def sha256(v:str)->str: return hashlib.sha256(v.encode()).hexdigest()
def mask(contact:str)->str:
    if '@' in contact: a,b=contact.split('@',1);return a[:1]+'***@'+b
    return contact[:3]+'*****'+contact[-2:]
