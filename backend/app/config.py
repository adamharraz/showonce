from dataclasses import dataclass, field
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')

MODEL = 'gemini-3.1-flash-lite'
FINAL_MODEL = 'gemini-3.8-flash'
LIVE_MODEL = 'gemini-3.8-live'

@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv('DATA_DIR', '.data')).resolve())
    storage_mode: str = field(default_factory=lambda: os.getenv('STORAGE_MODE', 'local'))
    gemini_key: str = field(default_factory=lambda: os.getenv('GEMINI_API_KEY', ''))
    free_tier_confirmed: bool = field(default_factory=lambda: os.getenv('FREE_TIER_CONFIRMED', 'false').lower() == 'true')
    supabase_url: str = field(default_factory=lambda: os.getenv('SUPABASE_URL', '').rstrip('/'))
    supabase_anon: str = field(default_factory=lambda: os.getenv('SUPABASE_ANON_KEY', ''))
    supabase_service: str = field(default_factory=lambda: os.getenv('SUPABASE_SERVICE_ROLE_KEY', ''))
    origin: str = field(default_factory=lambda: (os.getenv('APP_ORIGIN') or os.getenv('RENDER_EXTERNAL_URL') or 'http://localhost:8000').rstrip('/'))
    # Preview and legacy lessons remain fixed; complete video uses FINAL_MODEL.
    general_model: str = field(default=MODEL, init=False)
    coach_model: str = field(default=LIVE_MODEL, init=False)
    coach_enabled: bool = field(default_factory=lambda: os.getenv('LIVE_COACH_ENABLED', 'true').lower() == 'true')
    coach_seconds: int = field(default_factory=lambda: min(600, max(30, int(os.getenv('LIVE_COACH_SECONDS', '600')))))
    twin_enabled: bool = field(default_factory=lambda: os.getenv('TWIN_ENABLED', 'false').lower() == 'true')
    twin_free_confirmed: bool = field(default_factory=lambda: os.getenv('TWIN_FREE_CREDITS_CONFIRMED', 'false').lower() == 'true')
    twin_app: str = field(default_factory=lambda: os.getenv('TWIN_MODAL_APP', 'showonce-sf3d'))
    twin_environment: str = field(default_factory=lambda: os.getenv('TWIN_MODAL_ENVIRONMENT', 'main'))
    twin_total_limit: int = field(default_factory=lambda: min(10,max(1,int(os.getenv('TWIN_TOTAL_LIMIT', '10')))))
    twin_daily_limit: int = field(default_factory=lambda: min(3,max(1,int(os.getenv('TWIN_DAILY_LIMIT', '3')))))
    interval: float = field(default_factory=lambda: max(10., float(os.getenv('ANALYSIS_INTERVAL', '10'))))
    daily_limit: int = field(default_factory=lambda: int(os.getenv('DAILY_ANALYSIS_LIMIT', '120')))
    allow_local_login: bool = field(default_factory=lambda: os.getenv('ALLOW_LOCAL_LOGIN', 'true').lower() == 'true')
    demo_mode: bool = field(default_factory=lambda: os.getenv('DEMO_MODE', 'false').lower() == 'true')

    def validate(self):
        if self.storage_mode not in ('local', 'supabase'):
            raise RuntimeError('STORAGE_MODE must be local or supabase')
        if self.storage_mode == 'supabase' and not all((self.supabase_url, self.supabase_service, self.supabase_anon)):
            raise RuntimeError('Supabase configuration is incomplete')
        if self.demo_mode and (self.storage_mode != 'local' or self.allow_local_login):
            raise RuntimeError('Demo mode requires local storage and ALLOW_LOCAL_LOGIN=false')
        if os.getenv('RENDER') or self.origin.startswith('https://'):
            if self.allow_local_login or (self.storage_mode != 'supabase' and not self.demo_mode):
                raise RuntimeError('Hosted deployments require Supabase or explicit demo mode, with ALLOW_LOCAL_LOGIN=false')
        if self.gemini_key and not self.free_tier_confirmed:
            # A key alone must never enable potentially paid requests.
            pass
