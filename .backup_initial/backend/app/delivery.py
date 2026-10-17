import smtplib
from email.message import EmailMessage
import httpx
from .config import settings
class DeliveryError(Exception): pass
TEST_OUTBOX:list[dict]=[]  # only used when APP_ENV=test (automated tests); never in dev/production
def _text(code:str,purpose:str)->str:
    return f'Your PhotoTrace AI {"sign-up" if purpose=="register" else "login"} code is {code}. It expires in {settings.otp_ttl//60} minutes. If you did not request it, ignore this message.'
def send_code(channel:str,to:str,code:str,purpose:str)->None:
    """Raises DeliveryError unless the provider confirms acceptance. Codes are never logged."""
    if settings.app_env=='test': TEST_OUTBOX.append({'channel':channel,'to':to,'code':code,'purpose':purpose});return
    body=_text(code,purpose)
    try:
        if channel=='email':
            if settings.resend_key and settings.email_from:
                r=httpx.post('https://api.resend.com/emails',headers={'Authorization':f'Bearer {settings.resend_key}'},timeout=10,json={'from':settings.email_from,'to':[to],'subject':'Your PhotoTrace AI verification code','text':body})
                if r.status_code not in (200,201): raise DeliveryError(f'Resend rejected the request ({r.status_code})')
            elif settings.smtp_host and settings.email_from:
                m=EmailMessage();m['From']=settings.email_from;m['To']=to;m['Subject']='Your PhotoTrace AI verification code';m.set_content(body)
                with smtplib.SMTP(settings.smtp_host,settings.smtp_port,timeout=10) as s:
                    s.starttls()
                    if settings.smtp_user: s.login(settings.smtp_user,settings.smtp_password or '')
                    s.send_message(m)
            else: raise DeliveryError('Email delivery is not configured')
        else:
            if not (settings.twilio_sid and settings.twilio_token and settings.twilio_from): raise DeliveryError('SMS delivery is not configured')
            r=httpx.post(f'https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_sid}/Messages.json',auth=(settings.twilio_sid,settings.twilio_token),timeout=10,data={'To':to,'From':settings.twilio_from,'Body':body})
            if r.status_code!=201: raise DeliveryError(f'Twilio rejected the request ({r.status_code})')
    except DeliveryError: raise
    except Exception as e: raise DeliveryError(type(e).__name__) from e
