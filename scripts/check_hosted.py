"""Read-only public deployment checks; does not run AI or print credentials."""
import argparse
from pathlib import Path
import sys
from urllib.parse import urlparse
import httpx
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.config import MODEL, LIVE_MODEL

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('url',help='The deployed HTTPS application URL')
    args=parser.parse_args()
    origin=args.url.rstrip('/')
    parsed=urlparse(origin)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise SystemExit('Use the plain HTTPS deployment URL without credentials or query parameters.')
    with httpx.Client(base_url=origin,timeout=90,follow_redirects=False) as client:
        health=client.get('/api/health');health.raise_for_status()
        assert health.json()['status']=='ok'
        config=client.get('/api/config');config.raise_for_status();data=config.json()
        assert not data['local_login']
        assert data['storage_mode']=='supabase' or (data['storage_mode']=='local' and data['demo_mode'])
        assert data['app_origin']==origin
        assert data['coach_model']==LIVE_MODEL
        assert data['general_model']==MODEL
        assert not data['twin_enabled']
        assert not any('service_role' in name.lower() or name in ('gemini_key','gemini_api_key','demo_access_code') for name in data)
        for path in ('/coach','/settings'):
            page=client.get(path);page.raise_for_status()
            assert 'text/html' in page.headers.get('content-type','')
        icon=client.get('/favicon.svg');icon.raise_for_status()
        assert 'image/svg+xml' in icon.headers.get('content-type','')
        for path in ('/api/lessons','/api/components/catalogue','/api/twins'):
            assert client.get(path).status_code==401
        assert client.post('/api/auth/local',json={'role':'instructor'}).status_code==403
        if data['demo_mode']:
            for role in ('instructor', 'student'):
                entry=client.post('/api/auth/demo',json={'role':role});entry.raise_for_status()
                headers={'Authorization':'Bearer '+entry.json()['token']}
                identity=client.get('/api/me',headers=headers);identity.raise_for_status()
                assert identity.json()['role']==role
            assert client.post('/api/auth/demo',json={'role':'admin'}).status_code==422
    print('Hosted HTTPS, frontend, model policy and authentication guards passed. No AI request was made.')

if __name__=='__main__':main()
