"""Create a team-managed Supabase account. Never exposes passwords in arguments/logs."""
import argparse
import asyncio
from getpass import getpass
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.config import Settings
from app.storage import Store

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    parser.add_argument('--role', choices=['instructor', 'student'], required=True)
    args = parser.parse_args()
    settings = Settings(); settings.validate()
    if settings.storage_mode != 'supabase':
        raise SystemExit('Configure Supabase in backend/.env first.')
    password = getpass('New account password (not saved): ')
    if len(password) < 12:
        raise SystemExit('Use a password of at least 12 characters.')
    store = Store(settings)
    try:
        response = await store.client.post(f'{settings.supabase_url}/auth/v1/admin/users', headers=store.headers, json={'email': args.email, 'password': password, 'email_confirm': True})
        if response.status_code not in (200, 201):
            raise SystemExit(f'Account creation failed (HTTP {response.status_code}). Check the Supabase Auth dashboard; no profile was assigned.')
        id = response.json()['id']
        await store.put('profile', {'id': id, 'owner_id': id, 'role': args.role})
        print(f'Provisioned {args.role} account. Public registration must remain disabled in Supabase Auth.')
    finally:
        await store.close()

if __name__ == '__main__':
    asyncio.run(main())

