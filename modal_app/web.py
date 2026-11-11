"""Serve the ShowOnce demo from a production frontend build on Modal."""

import os
from pathlib import Path

import modal


ROOT = Path(__file__).resolve().parents[1]

app = modal.App('showonce-web')
image = (
    modal.Image.debian_slim(python_version='3.12')
    .apt_install('ffmpeg')
    .pip_install_from_requirements(ROOT / 'backend' / 'requirements-lock.txt')
    .env({
        'PYTHONPATH': '/app/backend',
        'PYTHONUNBUFFERED': '1',
        'DATA_DIR': '/tmp/showonce-demo',
        'STORAGE_MODE': 'local',
        'DEMO_MODE': 'true',
        'ALLOW_LOCAL_LOGIN': 'false',
        'TWIN_ENABLED': 'false',
    })
    .add_local_dir(ROOT / 'backend' / 'app', '/app/backend/app',
                   ignore=['**/__pycache__/**', '**/.env*'])
    .add_local_dir(ROOT / 'frontend' / 'dist', '/app/frontend/dist')
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name('showonce-web-gemini', required_keys=['GEMINI_API_KEY', 'FREE_TIER_CONFIRMED'])],
    cpu=1,
    memory=1024,
    min_containers=0,
    max_containers=1,
    scaledown_window=120,
    timeout=900,
)
@modal.concurrent(max_inputs=32)
@modal.asgi_app(label='showonce')
def web():
    # Phone pairing links, WebSocket checks and the reference iframe share this origin.
    origin = web.get_web_url()
    if not origin or not origin.startswith('https://'):
        raise RuntimeError('Modal did not supply an HTTPS endpoint for ShowOnce')
    os.environ['APP_ORIGIN'] = origin

    from app.main import app as showonce

    return showonce
