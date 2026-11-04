from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.reference import ReferenceFiles


def test_reference_can_load_anonymous_modules_without_exposing_the_app(tmp_path):
    (tmp_path / 'index.html').write_text('<h1>Reference</h1>')
    (tmp_path / 'main.js').write_text('export const ready = true;')
    app = FastAPI()
    app.mount('/reference', ReferenceFiles(directory=tmp_path, html=True))
    with TestClient(app) as client:
        page = client.get('/reference/', headers={'Origin': 'null'})
        assert page.status_code == 200
        policy = page.headers['content-security-policy']
        assert 'sandbox allow-scripts' in policy
        assert 'allow-same-origin' not in policy
        assert "connect-src 'none'" in policy
        assert "form-action 'none'" in policy
        assert page.headers['permissions-policy'] == 'camera=(), microphone=(), geolocation=()'
        module = client.get('/reference/main.js', headers={'Origin': 'null'})
        assert module.status_code == 200
        assert module.headers['access-control-allow-origin'] == '*'
        assert 'access-control-allow-credentials' not in module.headers
        assert module.headers['referrer-policy'] == 'no-referrer'
        assert client.get('/reference/missing.js').status_code == 404
