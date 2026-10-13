"""Explicitly enabled local UI fixture. Never used by the production server."""
import os
from pathlib import Path
if os.getenv('SHOWONCE_UI_FIXTURE') != 'true':
    raise RuntimeError('This test-only server requires SHOWONCE_UI_FIXTURE=true')
from app.config import Settings
from app.main import create_app
from tests.test_app import FakeAI
from tests.test_coach import TestBridge
from tests.test_twins import FakeTwinProvider
app = create_app(Settings(data_dir=Path('.tmp/ui-coach-fixture'), origin='http://127.0.0.1:8002',
    gemini_key='ui-test-only-key', free_tier_confirmed=True, storage_mode='local', allow_local_login=True,
    twin_enabled=True,twin_free_confirmed=True), FakeAI(), TestBridge, FakeTwinProvider())
