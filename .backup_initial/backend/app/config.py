import os
try:
    from dotenv import load_dotenv; load_dotenv()
except ImportError:
    pass
import os
class Settings:
    def __init__(self):
        e=os.environ.get
        self.app_env=e('APP_ENV','development');self.secret_key=e('SECRET_KEY','')
        self.database_url=e('DATABASE_URL','postgresql+psycopg://phototrace:phototrace@localhost:5432/phototrace')
        self.cors_origins=[o.strip() for o in e('CORS_ORIGINS','http://localhost:5173').split(',') if o.strip()]
        self.cookie_secure=e('COOKIE_SECURE','true' if self.app_env=='production' else 'false').lower()=='true'
        self.cookie_samesite=e('COOKIE_SAMESITE','lax').lower()
        self.session_ttl=int(e('SESSION_TTL_SECONDS','604800'));self.otp_ttl=int(e('OTP_TTL_SECONDS','600'))
        self.cooldown=int(e('RESEND_COOLDOWN_SECONDS','60'));self.otp_max_attempts=5;self.contact_per_hour=5
        self.rate_ip=int(e('RATE_LIMIT_IP_PER_MIN','20'));self.upload_dir=e('UPLOAD_DIR','uploads')
        self.resend_key=e('RESEND_API_KEY');self.email_from=e('EMAIL_FROM')
        self.smtp_host=e('SMTP_HOST');self.smtp_port=int(e('SMTP_PORT','587'));self.smtp_user=e('SMTP_USER');self.smtp_password=e('SMTP_PASSWORD')
        self.twilio_sid=e('TWILIO_ACCOUNT_SID');self.twilio_token=e('TWILIO_AUTH_TOKEN');self.twilio_from=e('TWILIO_FROM_NUMBER')
    def validate(self):
        if self.app_env!='test' and len(self.secret_key)<32: raise RuntimeError('SECRET_KEY must be set to 32+ random characters')
        if self.app_env=='production' and not self.cookie_secure: raise RuntimeError('COOKIE_SECURE must be true in production')
settings=Settings()
