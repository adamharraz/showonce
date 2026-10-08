import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from fastapi import HTTPException

@dataclass
class User:
    id: str
    role: str

class Auth:
    def __init__(self, settings, store):
        self.settings, self.store = settings, store
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        path = settings.data_dir / 'auth.secret'
        if not path.exists():
            path.write_bytes(secrets.token_bytes(32))
        self.secret = path.read_bytes()
        self.tickets = {}

    def token(self, role):
        payload = base64.urlsafe_b64encode(json.dumps({'id': f'local-{role}', 'role': role, 'exp': time.time() + 28800}).encode()).decode()
        sig = hmac.new(self.secret, payload.encode(), hashlib.sha256).hexdigest()
        return f'{payload}.{sig}'

    async def user(self, token):
        if self.settings.storage_mode == 'local' and self.settings.allow_local_login:
            try:
                payload, sig = token.split('.')
                expected = hmac.new(self.secret, payload.encode(), hashlib.sha256).hexdigest()
                if not hmac.compare_digest(sig, expected):
                    raise ValueError()
                data = json.loads(base64.urlsafe_b64decode(payload))
                if data['exp'] < time.time() or data['role'] not in ('instructor', 'student'):
                    raise ValueError()
                return User(data['id'], data['role'])
            except (ValueError, KeyError, TypeError):
                raise HTTPException(401, 'Please sign in again')
        if not token:
            raise HTTPException(401, 'Sign in required')
        r = await self.store.client.get(f'{self.settings.supabase_url}/auth/v1/user', headers={'apikey': self.settings.supabase_anon, 'Authorization': f'Bearer {token}'})
        if r.status_code != 200:
            raise HTTPException(401, 'Please sign in again')
        data = r.json()
        profile = await self.store.get('profile', data['id'])
        if not profile:
            raise HTTPException(403, 'This account has not been provisioned for ShowOnce')
        return User(data['id'], profile['role'])

    def ticket(self, session_id, user_id):
        token = secrets.token_urlsafe(32)
        self.tickets[token] = {'session_id': session_id, 'user_id': user_id, 'expires': time.time() + 120}
        return token

    def consume_ticket(self, token, session_id):
        data = self.tickets.pop(token, None)
        if not data or data['session_id'] != session_id or data['expires'] < time.time():
            raise HTTPException(401, 'Pairing ticket expired or already used; create a new QR code')
        return data
