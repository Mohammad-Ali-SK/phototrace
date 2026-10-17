import os
from pathlib import Path
from typing import Optional

_last_env_mtime: float = 0.0

def load_backend_env(force: bool = False):
    global _last_env_mtime
    if os.environ.get('APP_ENV') == 'test':
        return
    try:
        from dotenv import load_dotenv
        backend_env = Path(__file__).resolve().parent.parent / '.env'
        if backend_env.exists():
            mtime = backend_env.stat().st_mtime
            if force or mtime > _last_env_mtime:
                saved_app_env = os.environ.get('APP_ENV')
                load_dotenv(backend_env, override=True)
                if saved_app_env:
                    os.environ['APP_ENV'] = saved_app_env
                _last_env_mtime = mtime
        root_env = Path(__file__).resolve().parent.parent.parent / '.env'
        if root_env.exists():
            load_dotenv(root_env, override=False)
    except ImportError:
        pass

load_backend_env(force=True)

class Settings:
    def __init__(self):
        e = os.environ.get
        self._app_env = e('APP_ENV', 'development')
        self.secret_key = e('SECRET_KEY', '')
        self.database_url = e('DATABASE_URL', 'postgresql+psycopg://phototrace:phototrace@localhost:5432/phototrace')
        self.cors_origins = [o.strip() for o in e('CORS_ORIGINS', 'http://localhost:5173').split(',') if o.strip()]
        self.cookie_secure = e('COOKIE_SECURE', 'true' if self.app_env == 'production' else 'false').lower() == 'true'
        self.cookie_samesite = e('COOKIE_SAMESITE', 'lax').lower()
        self.session_ttl = int(e('SESSION_TTL_SECONDS', '604800'))
        self.otp_ttl = int(e('OTP_TTL_SECONDS', '600'))
        self.cooldown = int(e('RESEND_COOLDOWN_SECONDS', '60'))
        self.otp_max_attempts = 5
        self.contact_per_hour = 5
        self.rate_ip = int(e('RATE_LIMIT_IP_PER_MIN', '20'))
        self.upload_dir = e('UPLOAD_DIR', 'uploads')
        self.resend_key = e('RESEND_API_KEY')
        self.email_from = e('EMAIL_FROM')
        self.smtp_host = e('SMTP_HOST')
        self.smtp_port = int(e('SMTP_PORT', '587'))
        self.smtp_user = e('SMTP_USER')
        self.smtp_password = e('SMTP_PASSWORD')
        self.twilio_sid = e('TWILIO_ACCOUNT_SID')
        self.twilio_token = e('TWILIO_AUTH_TOKEN')
        self.twilio_from = e('TWILIO_FROM_NUMBER')
        self._google_search_api_key: Optional[str] = None
        self._google_search_cx: Optional[str] = None
        self._google_vision_api_key: Optional[str] = None
        self._bing_search_api_key: Optional[str] = None
        self._serpapi_api_key: Optional[str] = None
        self._search_provider: Optional[str] = None

    @property
    def app_env(self) -> str:
        return os.environ.get('APP_ENV', self._app_env)

    @app_env.setter
    def app_env(self, v: str):
        self._app_env = v

    @property
    def google_search_api_key(self) -> Optional[str]:
        val = os.environ.get('GOOGLE_SEARCH_API_KEY')
        return val if val is not None else self._google_search_api_key

    @google_search_api_key.setter
    def google_search_api_key(self, v: Optional[str]):
        self._google_search_api_key = v

    @property
    def google_search_cx(self) -> Optional[str]:
        val = os.environ.get('GOOGLE_SEARCH_CX')
        return val if val is not None else self._google_search_cx

    @google_search_cx.setter
    def google_search_cx(self, v: Optional[str]):
        self._google_search_cx = v

    @property
    def google_vision_api_key(self) -> Optional[str]:
        val = os.environ.get('GOOGLE_VISION_API_KEY')
        return val if val is not None else self._google_vision_api_key

    @google_vision_api_key.setter
    def google_vision_api_key(self, v: Optional[str]):
        self._google_vision_api_key = v

    @property
    def bing_search_api_key(self) -> Optional[str]:
        val = os.environ.get('BING_SEARCH_API_KEY')
        return val if val is not None else self._bing_search_api_key

    @bing_search_api_key.setter
    def bing_search_api_key(self, v: Optional[str]):
        self._bing_search_api_key = v

    @property
    def serpapi_api_key(self) -> Optional[str]:
        val = os.environ.get('SERPAPI_API_KEY')
        return val if val is not None else self._serpapi_api_key

    @serpapi_api_key.setter
    def serpapi_api_key(self, v: Optional[str]):
        self._serpapi_api_key = v

    @property
    def search_provider(self) -> str:
        return os.environ.get('SEARCH_PROVIDER') or self._search_provider or 'auto'

    @search_provider.setter
    def search_provider(self, v: Optional[str]):
        self._search_provider = v

    def validate(self):
        if self.app_env != 'test' and len(self.secret_key) < 32:
            raise RuntimeError('SECRET_KEY must be set to 32+ random characters')
        if self.app_env == 'production' and not self.cookie_secure:
            raise RuntimeError('COOKIE_SECURE must be true in production')

settings = Settings()
