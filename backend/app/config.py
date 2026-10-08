from dataclasses import dataclass, field
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')

@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv('DATA_DIR', '.data')).resolve())
    storage_mode: str = field(default_factory=lambda: os.getenv('STORAGE_MODE', 'local'))
    gemini_key: str = field(default_factory=lambda: os.getenv('GEMINI_API_KEY', ''))
    free_tier_confirmed: bool = field(default_factory=lambda: os.getenv('FREE_TIER_CONFIRMED', 'false').lower() == 'true')
    supabase_url: str = field(default_factory=lambda: os.getenv('SUPABASE_URL', '').rstrip('/'))
    supabase_anon: str = field(default_factory=lambda: os.getenv('SUPABASE_ANON_KEY', ''))
    supabase_service: str = field(default_factory=lambda: os.getenv('SUPABASE_SERVICE_ROLE_KEY', ''))
    origin: str = field(default_factory=lambda: os.getenv('APP_ORIGIN', 'http://localhost:8000').rstrip('/'))
    physical_observer: str = field(default_factory=lambda: os.getenv('PHYSICAL_OBSERVER', 'er2'))
    general_model: str = field(default_factory=lambda: os.getenv('GENERAL_MODEL', 'gemini-3.8-flash'))
    fallback_model: str = field(default_factory=lambda: os.getenv('GENERAL_FALLBACK_MODEL', 'gemini-3.5-flash-lite'))
    physical_assessor: str = field(default_factory=lambda: os.getenv('PHYSICAL_ASSESSOR', 'gemini-robotics-er-2-preview'))
    interval: float = field(default_factory=lambda: max(10., float(os.getenv('ANALYSIS_INTERVAL', '10'))))
    daily_limit: int = field(default_factory=lambda: int(os.getenv('DAILY_ANALYSIS_LIMIT', '120')))
    allow_local_login: bool = field(default_factory=lambda: os.getenv('ALLOW_LOCAL_LOGIN', 'true').lower() == 'true')

    def validate(self):
        if self.storage_mode not in ('local', 'supabase'):
            raise RuntimeError('STORAGE_MODE must be local or supabase')
        if self.storage_mode == 'supabase' and not all((self.supabase_url, self.supabase_service, self.supabase_anon)):
            raise RuntimeError('Supabase configuration is incomplete')
        if os.getenv('RENDER') or self.origin.startswith('https://'):
            if self.storage_mode != 'supabase' or self.allow_local_login:
                raise RuntimeError('Hosted deployments require Supabase and ALLOW_LOCAL_LOGIN=false')
        if self.gemini_key and not self.free_tier_confirmed:
            # A key alone must never enable potentially paid requests.
            pass
