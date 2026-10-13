"""Owner-only photo → Modal SF3D → stored GLB. No generated circuit claims."""
import asyncio
import base64
import hashlib
import io
import json
import struct
import time
from datetime import datetime, timezone, timedelta
from typing import Literal
from fastapi import Depends, HTTPException
from fastapi.responses import Response
from PIL import Image, ImageOps
from pydantic import Field
from .models import Strict, uid
from .services import now

MODEL = 'stabilityai/stable-fast-3d'
WEIGHT_REVISION = 'f0c9a8ffd62cb1bbc8a7a53c9f87a0be1b6be778'
MAX_GLB = 50 * 1024 * 1024

class CreateTwin(Strict):
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    image: str = Field(min_length=1, max_length=3000000)
    title: str = Field(default='My build', min_length=1, max_length=200)
    session_id: str | None = Field(default=None, max_length=100)
    remove_background: bool = True
    consent: Literal[True]

class TwinRecord(Strict):
    id: str
    title: str
    state: Literal['queued', 'preparing', 'generating', 'ready', 'error', 'interrupted']
    model: str = MODEL
    created_at: str
    updated_at: str
    error: str | None = None
    byte_size: int = 0
    generation_seconds: float | None = None
    reused: bool = False
    remove_background: bool = True

def public_record(record):
    return TwinRecord.model_validate({k:v for k,v in record.items() if k in TwinRecord.model_fields})

def normalize_photo(encoded):
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 2000000:
            raise ValueError('Photo is too large')
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > 16000000 or image.width < 32 or image.height < 32:
                raise ValueError('Use a readable photo with dimensions between 32px and 16 megapixels')
            image = ImageOps.exif_transpose(image).convert('RGB')
            image.thumbnail((1024, 1024))
            output = io.BytesIO(); image.save(output, format='JPEG', quality=90)
        return output.getvalue()
    except (ValueError, OSError) as exc:
        raise HTTPException(422, 'Use a valid JPEG/PNG photo under 2 MB') from exc

def validate_glb(data):
    if not isinstance(data, bytes) or not 20 <= len(data) <= MAX_GLB:
        raise ValueError('Invalid model size')
    magic, version, length = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or length != len(data):
        raise ValueError('Invalid GLB header')
    chunk_length, chunk_type = struct.unpack_from('<II', data, 12)
    if chunk_type != 0x4E4F534A or chunk_length > min(len(data)-20, 4000000):
        raise ValueError('Invalid GLB JSON chunk')
    document = json.loads(data[20:20+chunk_length])
    if not isinstance(document, dict) or document.get('asset', {}).get('version') != '2.0' or not document.get('meshes'):
        raise ValueError('Model contains no glTF mesh')
    # The browser must never fetch arbitrary URLs from a model's resources.
    if any('uri' in resource for name in ('buffers', 'images') for resource in document.get(name, [])):
        raise ValueError('Only self-contained models are accepted')
    if len(document.get('nodes', [])) > 10000:
        raise ValueError('Model has too many nodes')
    return data

class ModalTwinProvider:
    def __init__(self, settings): self.settings = settings

    async def submit(self, stage, photo=None, remove_background=True):
        import modal
        if stage == 'prepare':
            worker = modal.Function.from_name(self.settings.twin_app, 'prepare_model', environment_name=self.settings.twin_environment)
            call = await worker.spawn.aio()
        else:
            worker = modal.Cls.from_name(self.settings.twin_app, 'SF3DWorker', environment_name=self.settings.twin_environment)()
            call = await worker.generate.spawn.aio(photo, remove_background)
        return call.object_id

    async def poll(self, call_id):
        import modal
        try:
            result = await modal.FunctionCall.from_id(call_id).get.aio(timeout=0)
            return True, result
        except TimeoutError:
            return False, None

class TwinManager:
    def __init__(self, settings, store, provider=None):
        self.settings, self.store = settings, store
        self.provider = provider or ModalTwinProvider(settings)
        self.lock = asyncio.Lock()
        self.tasks = {}
        self.retention_task = None

    def check_ready(self):
        if not self.settings.twin_enabled:
            raise HTTPException(503, 'Photo-to-3D is awaiting the Modal worker and Hugging Face setup. Saved models remain available.')
        if not self.settings.twin_free_confirmed:
            raise HTTPException(503, 'Verify available Modal credits and a US$0 workspace spend limit before generation.')

    def watch(self, record):
        if record['id'] not in self.tasks:
            task = asyncio.create_task(self.run(record))
            self.tasks[record['id']] = task
            task.add_done_callback(lambda _: self.tasks.pop(record['id'], None))

    async def cleanup(self):
        cutoff = datetime.now(timezone.utc)-timedelta(days=7)
        for record in await self.store.all('twin'):
            if datetime.fromisoformat(record['created_at']) < cutoff:
                for key in ('photo_key','model_key'):
                    if record.get(key): await self.store.delete_blob(record[key])
                await self.store.delete('twin', record['id']); continue

    async def retention_loop(self):
        while True:
            await asyncio.sleep(3600)
            await self.cleanup()

    async def recover(self):
        await self.cleanup()
        for record in await self.store.all('twin'):
            if record['state'] in ('preparing','generating') and record.get('call_id'):
                # Resume polling the SAME call, never submit a second GPU job.
                self.watch(record)
            elif record['state'] in ('queued','preparing','generating'):
                record.update(state='interrupted', error='The server stopped before the remote call was recorded. Review Modal before explicitly starting another generation.', updated_at=now())
                await self.store.put('twin', record)
        self.retention_task = asyncio.create_task(self.retention_loop())

    async def close(self):
        tasks = list(self.tasks.values())
        if self.retention_task: tasks.append(self.retention_task)
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def create(self, body, current, photo_override=None):
        photo = photo_override if photo_override is not None else normalize_photo(body.image)
        if body.session_id:
            session = await self.store.get('coach_session', body.session_id)
            if not session or session['owner_id'] != current.id:
                raise HTTPException(403, 'Choose your own coaching session')
        digest = hashlib.sha256(photo + bytes([body.remove_background]) + WEIGHT_REVISION.encode()).hexdigest()
        async with self.lock:
            records = await self.store.all('twin')
            prior = next((r for r in records if r['owner_id']==current.id and r['request_id']==body.request_id), None)
            if prior:
                if prior['digest'] != digest: raise HTTPException(409, 'This request ID belongs to another photo')
                return prior
            cached = next((r for r in records if r['owner_id']==current.id and r['digest']==digest and r['state']=='ready'), None)
            if cached: return {**cached, 'reused': True}
            self.check_ready()
            if any(r['state'] in ('queued','preparing','generating') for r in records):
                raise HTTPException(409, 'One 3D job is already running. Wait for it to finish.')
            usage = await self.store.get('twin_budget', 'sf3d-budget') or {'id':'sf3d-budget','attempts':0,'day':now()[:10],'day_attempts':0}
            if usage['day'] != now()[:10]: usage.update(day=now()[:10], day_attempts=0)
            if usage['attempts'] >= self.settings.twin_total_limit or usage['day_attempts'] >= self.settings.twin_daily_limit:
                raise HTTPException(429, 'The local 3D generation allowance is used. No paid fallback is enabled.')
            # Reserve before remote submission. Failed attempts also consume allowance.
            usage['attempts'] += 1; usage['day_attempts'] += 1
            await self.store.put('twin_budget', usage)
            id = uid()
            record = {'id':id,'owner_id':current.id,'request_id':body.request_id,'title':body.title,
                'session_id':body.session_id,'digest':digest,'state':'queued','model':MODEL,
                'created_at':now(),'updated_at':now(),'error':None,'byte_size':0,'generation_seconds':None,
                'remove_background':body.remove_background,'photo_key':f'twins/{current.id}/{id}/source.jpg',
                'model_key':None,'call_id':None}
            await self.store.put_blob(record['photo_key'], photo)
            await self.store.put('twin', record)
            self.watch(record)
            return record

    async def run(self, record):
        started = time.monotonic()
        try:
            if not record.get('call_id'):
                record.update(state='preparing', updated_at=now())
                await self.store.put('twin', record)
                record['call_id'] = await self.provider.submit('prepare')
                await self.store.put('twin', record)
            while time.monotonic()-started < 900:
                done, result = await self.provider.poll(record['call_id'])
                if not done: await asyncio.sleep(2); continue
                if record['state'] == 'preparing':
                    if not isinstance(result, dict) or not result.get('ready'):
                        raise ValueError('Model access or weight preparation failed')
                    self.check_ready()
                    photo = await self.store.get_blob(record['photo_key'])
                    # Clear the previous call BEFORE spawning: recovery will mark
                    # this interval interrupted instead of duplicating paid work.
                    record.update(state='generating', call_id=None, updated_at=now())
                    await self.store.put('twin', record)
                    record['call_id'] = await self.provider.submit('generate', photo, record['remove_background'])
                    await self.store.put('twin', record)
                    continue
                if not isinstance(result, dict): raise ValueError('Invalid provider result')
                model = validate_glb(result.get('glb'))
                record['model_key'] = f"twins/{record['owner_id']}/{record['id']}/model.glb"
                await self.store.put_blob(record['model_key'], model, content_type='model/gltf-binary')
                record.update(state='ready', byte_size=len(model), generation_seconds=result.get('generation_seconds'), updated_at=now())
                await self.store.put('twin', record)
                await self.store.put('metric', {'id':uid(),'owner_id':record['owner_id'],'session_id':record.get('session_id'),
                    'operation':'photo_to_3d','model':MODEL,'provider':'modal','created_at':now(),
                    'latency_ms':round((time.monotonic()-started)*1000),'gpu':'A10','texture_resolution':1024})
                return
            raise ValueError('The remote generation did not finish within 15 minutes')
        except asyncio.CancelledError:
            raise
        except Exception:
            # Provider exceptions can include credentials/URLs. Keep them private
            # to Modal's console; expose a stable, actionable application message.
            uncertain = record['state'] in ('preparing','generating') and not record.get('call_id')
            record.update(state='interrupted' if uncertain else 'error', updated_at=now(), error=
                'The Modal submission was not acknowledged. Check Modal for an existing job before starting another attempt.' if uncertain else
                '3D generation failed. Check Modal model access, GPU availability and spending limits. Your photo is preserved; no automatic retry was made.')
            await self.store.put('twin', record)

    def register(self, app, user):
        async def owned(id, current):
            record = await self.store.get('twin', id)
            if not record: raise HTTPException(404, '3D model not found')
            if record['owner_id'] != current.id: raise HTTPException(403, 'This 3D model belongs to another account')
            return record

        @app.post('/api/twins', response_model=TwinRecord, status_code=202)
        async def create(body:CreateTwin,current=Depends(user)): return public_record(await self.create(body,current))

        @app.get('/api/twins', response_model=list[TwinRecord])
        async def history(current=Depends(user)):
            return [public_record(r) for r in sorted([r for r in await self.store.all('twin') if r['owner_id']==current.id], key=lambda r:r['created_at'], reverse=True)[:20]]

        @app.get('/api/twins/{id}', response_model=TwinRecord)
        async def get(id:str,current=Depends(user)): return public_record(await owned(id,current))

        @app.post('/api/twins/{id}/retry', response_model=TwinRecord, status_code=202)
        async def retry(id:str,current=Depends(user)):
            prior = await owned(id,current)
            if prior['state'] != 'error': raise HTTPException(409,'Only failed generations can be explicitly retried. Review interrupted jobs in Modal first.')
            photo = await self.store.get_blob(prior['photo_key'])
            body = CreateTwin(request_id=uid(),image=base64.b64encode(photo).decode(),title=prior['title'],
                session_id=prior.get('session_id'),remove_background=prior['remove_background'],consent=True)
            return public_record(await self.create(body,current,photo_override=photo))

        @app.get('/api/twins/{id}/model')
        async def model(id:str,current=Depends(user)):
            record = await owned(id,current)
            if record['state'] != 'ready': raise HTTPException(409, 'The 3D model is not ready')
            data = await self.store.get_blob(record['model_key'])
            return Response(data, media_type='model/gltf-binary', headers={'Content-Disposition':f'attachment; filename="showonce-{id}.glb"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})

        @app.get('/api/twins/{id}/photo')
        async def photo(id:str,current=Depends(user)):
            record = await owned(id,current)
            return Response(await self.store.get_blob(record['photo_key']),media_type='image/jpeg',headers={'Cache-Control':'private, no-store'})
