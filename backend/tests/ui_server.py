"""Isolated UI integration server; never selected by the production entry point."""
import os
from pathlib import Path
if os.getenv('SHOWONCE_UI_FIXTURE') != 'true':
    raise RuntimeError('This test fixture requires SHOWONCE_UI_FIXTURE=true')
from app.config import Settings
from app.main import create_app
from .test_app import FakeAI

app = create_app(Settings(data_dir=Path('.tmp/ui-fixture'), origin='http://127.0.0.1:8001', physical_observer='flash', interval=3600, gemini_key='', storage_mode='local', allow_local_login=True), FakeAI())

@app.middleware('http')
async def mark_test_fixture(request, call_next):
    response = await call_next(request)
    response.headers['X-ShowOnce-Test-Fixture'] = 'true'
    return response

