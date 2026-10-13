"""Public demo role entry retains token and role guards without an access code."""
import base64
import json
import time
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from tests.test_app import FakeAI

def test_render_origin_is_derived_without_guessing_the_service_hostname(monkeypatch):
    monkeypatch.delenv('APP_ORIGIN', raising=False)
    monkeypatch.setenv('RENDER_EXTERNAL_URL', 'https://assigned-name.onrender.com')
    assert Settings().origin == 'https://assigned-name.onrender.com'
    monkeypatch.setenv('APP_ORIGIN', 'https://custom.example.com')
    assert Settings().origin == 'https://custom.example.com'

def settings(tmp_path, **overrides):
    values = dict(data_dir=tmp_path, storage_mode='local', allow_local_login=False,
                  demo_mode=True, origin='https://demo.example.com',
                  gemini_key='', interval=3600)
    values.update(overrides)
    return Settings(**values)

@pytest.mark.parametrize('overrides', [
    {'allow_local_login': True}, {'demo_mode': False},
])
def test_unsafe_hosted_settings_fail(tmp_path, overrides):
    with pytest.raises(RuntimeError):
        settings(tmp_path, **overrides).validate()

def test_public_demo_roles_and_permission_guards(tmp_path):
    with TestClient(create_app(settings(tmp_path), FakeAI())) as client:
        config = client.get('/api/config').json()
        assert config['demo_mode'] and not config['local_login']
        assert 'demo_access_code' not in config
        assert client.post('/api/auth/local', json={'role': 'instructor'}).status_code == 403
        assert client.get('/api/lessons').status_code == 401
        assert client.post('/api/auth/demo', json={'role': 'admin'}).status_code == 422
        signed_in = {}
        for role in ('instructor', 'student'):
            response = client.post('/api/auth/demo', json={'role': role})
            assert response.status_code == 200
            data = response.json()
            assert data['user'] == {'id': f'demo-{role}', 'role': role}
            headers = {'Authorization': 'Bearer ' + data['token']}
            assert client.get('/api/me', headers=headers).json() == data['user']
            signed_in[role] = headers
        assert client.post('/api/sessions', headers=signed_in['student'], json={'mode': 'teach', 'source': 'camera'}).status_code == 403
        session = client.post('/api/sessions', headers=signed_in['instructor'], json={'mode': 'teach', 'source': 'camera'}).json()
        assert client.get('/api/sessions/' + session['id'], headers=signed_in['student']).status_code == 403
        token = signed_in['instructor']['Authorization'].removeprefix('Bearer ')
        with client.websocket_connect('/api/sessions/' + session['id'] + '/stream', headers={'origin': 'https://demo.example.com'}) as ws:
            ws.send_json({'type': 'authenticate', 'token': token})
            assert ws.receive_json()['type'] == 'status'

def test_demo_tokens_cannot_be_forged_or_reused_after_storage_reset(tmp_path):
    app = create_app(settings(tmp_path / 'first'), FakeAI())
    with TestClient(app) as client:
        token = client.post('/api/auth/demo', json={'role': 'instructor'}).json()['token']
        payload, signature = token.split('.')
        data = json.loads(base64.urlsafe_b64decode(payload))
        data['role'] = 'student'
        forged = base64.urlsafe_b64encode(json.dumps(data).encode()).decode() + '.' + signature
        assert client.get('/api/me', headers={'Authorization': 'Bearer ' + forged}).status_code == 401
        assert client.get('/api/me', headers={'Authorization': 'Bearer malformed'}).status_code == 401
        original_time = time.time
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr('app.auth.time.time', lambda: original_time() + 28801)
            assert client.get('/api/me', headers={'Authorization': 'Bearer ' + token}).status_code == 401
    with TestClient(create_app(settings(tmp_path / 'fresh'), FakeAI())) as client:
        assert client.get('/api/me', headers={'Authorization': 'Bearer ' + token}).status_code == 401
        assert client.post('/api/auth/demo', json={'role': 'instructor'}).status_code == 200

def test_sign_in_is_rate_limited_and_recovers(tmp_path):
    with TestClient(create_app(settings(tmp_path), FakeAI())) as client:
        for _ in range(20):
            assert client.post('/api/auth/demo', json={'role': 'instructor'}).status_code == 200
        assert client.post('/api/auth/demo', json={'role': 'instructor'}).status_code == 429
        future = time.monotonic() + 61
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr('app.auth.time.monotonic', lambda: future)
            assert client.post('/api/auth/demo', json={'role': 'instructor'}).status_code == 200

def test_demo_endpoint_disabled_for_normal_local_mode(tmp_path):
    with TestClient(create_app(settings(tmp_path, demo_mode=False, allow_local_login=True, origin='http://localhost:8000'), FakeAI())) as client:
        assert client.post('/api/auth/demo', json={'role': 'instructor'}).status_code == 403
