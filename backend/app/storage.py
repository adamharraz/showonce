import asyncio
import json
from pathlib import Path
import sqlite3
import httpx

class Store:
    """Local persistence for the backup, or private Supabase REST persistence."""
    def __init__(self, settings):
        self.settings = settings
        self.lock = asyncio.Lock()
        self.client = httpx.AsyncClient(timeout=30)
        if settings.storage_mode == 'local':
            settings.data_dir.mkdir(parents=True, exist_ok=True)
            self.db = sqlite3.connect(settings.data_dir / 'showonce.sqlite3', check_same_thread=False)
            self.db.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner_id TEXT NOT NULL, payload TEXT NOT NULL)')
            self.db.commit()
        else:
            self.db = None

    @property
    def headers(self):
        return {'apikey': self.settings.supabase_service, 'Authorization': f'Bearer {self.settings.supabase_service}'}

    async def put(self, kind, value):
        row = {'id': value['id'], 'kind': kind, 'owner_id': value.get('owner_id', ''), 'payload': value}
        if self.db:
            async with self.lock:
                self.db.execute('INSERT OR REPLACE INTO records VALUES (?,?,?,?)', (row['id'], kind, row['owner_id'], json.dumps(value)))
                self.db.commit()
        else:
            r = await self.client.post(f'{self.settings.supabase_url}/rest/v1/showonce_records', headers={**self.headers, 'Prefer': 'resolution=merge-duplicates'}, json=row)
            r.raise_for_status()

    async def get(self, kind, id):
        if self.db:
            row = self.db.execute('SELECT payload FROM records WHERE id=? AND kind=?', (id, kind)).fetchone()
            return json.loads(row[0]) if row else None
        r = await self.client.get(f'{self.settings.supabase_url}/rest/v1/showonce_records', headers=self.headers, params={'id': f'eq.{id}', 'kind': f'eq.{kind}', 'select': 'payload'})
        r.raise_for_status()
        rows = r.json()
        return rows[0]['payload'] if rows else None

    async def all(self, kind):
        if self.db:
            return [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM records WHERE kind=?', (kind,)).fetchall()]
        rows, offset = [], 0
        while True:
            r = await self.client.get(f'{self.settings.supabase_url}/rest/v1/showonce_records', headers=self.headers, params={'kind': f'eq.{kind}', 'select': 'payload', 'order': 'id.asc', 'limit': '500', 'offset': str(offset)})
            r.raise_for_status()
            page = r.json()
            rows.extend(x['payload'] for x in page)
            if len(page) < 500:
                return rows
            offset += 500

    async def delete(self, kind, id):
        if self.db:
            async with self.lock:
                self.db.execute('DELETE FROM records WHERE id=? AND kind=?', (id, kind))
                self.db.commit()
        else:
            r = await self.client.delete(f'{self.settings.supabase_url}/rest/v1/showonce_records', headers=self.headers, params={'id': f'eq.{id}', 'kind': f'eq.{kind}'})
            r.raise_for_status()

    async def put_blob(self, key, data):
        if self.db:
            path = self.settings.data_dir / 'frames' / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        else:
            r = await self.client.post(f'{self.settings.supabase_url}/storage/v1/object/showonce/{key}', headers={**self.headers, 'Content-Type': 'image/jpeg', 'x-upsert': 'true'}, content=data)
            r.raise_for_status()

    async def get_blob(self, key):
        if self.db:
            return (self.settings.data_dir / 'frames' / key).read_bytes()
        r = await self.client.get(f'{self.settings.supabase_url}/storage/v1/object/authenticated/showonce/{key}', headers=self.headers)
        r.raise_for_status()
        return r.content

    async def delete_blob(self, key):
        if self.db:
            (self.settings.data_dir / 'frames' / key).unlink(missing_ok=True)
        else:
            r = await self.client.request('DELETE', f'{self.settings.supabase_url}/storage/v1/object/showonce', headers=self.headers, json={'prefixes': [key]})
            r.raise_for_status()

    async def close(self):
        await self.client.aclose()
        if self.db:
            self.db.close()
