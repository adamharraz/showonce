"""Durable, ordered recording uploads; never confuse capture with AI coverage."""
import asyncio
import base64
import hashlib
import hmac
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field


class RecordingStart(BaseModel):
    mime: str
    audio: bool
    start_ms: int = Field(ge=0, le=300000)


class RecordingEnd(BaseModel):
    count: int = Field(ge=1, le=400)
    duration_ms: int = Field(gt=0, le=310000)


def media_command(args):
    result = subprocess.run(args, capture_output=True, timeout=90,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if result.returncode:
        raise ValueError('Recording could not be decoded. Saved chunks are preserved; no complete-media claim was made.')
    return result.stdout


class Recordings:
    def __init__(self, store, auth):
        self.store, self.auth = store, auth
        self.lock = asyncio.Lock()

    def capture_token(self, session_id):
        payload = base64.urlsafe_b64encode(json.dumps({'session': session_id, 'exp': time.time()+3600}).encode()).decode()
        return payload+'.'+hmac.new(self.auth.secret, payload.encode(), hashlib.sha256).hexdigest()

    async def authorize(self, request, session_id, user):
        session = await self.store.get('session', session_id)
        if not session or not session.get('recording_required'):
            raise HTTPException(404, 'Full recording session not found')
        token = request.headers.get('x-capture-token')
        if token:
            try:
                payload, signature = token.split('.')
                assert hmac.compare_digest(signature, hmac.new(self.auth.secret, payload.encode(), hashlib.sha256).hexdigest())
                data = json.loads(base64.urlsafe_b64decode(payload))
                assert data['session'] == session_id and data['exp'] > time.time()
            except Exception:
                raise HTTPException(401, 'Capture upload permission expired')
        else:
            current = await user(request)
            if session['owner_id'] != current.id:
                raise HTTPException(403, 'This recording belongs to another instructor')
        return session

    def register(self, app, user):
        @app.post('/api/sessions/{id}/recording/start')
        async def start(id: str, body: RecordingStart, request: Request):
            session = await self.authorize(request, id, user)
            if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
                raise HTTPException(503, 'Full recording requires FFmpeg and ffprobe on the server')
            if body.mime.split(';')[0] not in ('video/webm', 'video/mp4'):
                raise HTTPException(422, 'Unsupported recording format')
            async with self.lock:
                previous = await self.store.get('recording', 'recording-' + id)
                if previous:
                    raise HTTPException(409, 'Recording already started; resume its upload instead')
                if session.get('finished_at'):
                    raise HTTPException(409, 'Recording has ended')
                record = {'id': 'recording-' + id, 'session_id': id, 'owner_id': session['owner_id'], 'state': 'uploading',
                          **body.model_dump(), 'chunks': [], 'bytes': 0, 'created_at': time.time()}
                await self.store.put('recording', record)
            return {'state': 'uploading'}

        @app.post('/api/sessions/{id}/recording/chunks/{sequence}')
        async def chunk(id: str, sequence: int, request: Request):
            await self.authorize(request, id, user)
            if not 0 <= sequence < 400:
                raise HTTPException(422, 'Invalid chunk number')
            data = bytearray()
            async for part in request.stream():
                data.extend(part)
                if len(data) > 12*1024*1024:
                    raise HTTPException(413, 'Recording chunk exceeds 12 MB')
            if not data:
                raise HTTPException(422, 'Empty recording chunk')
            digest = hashlib.sha256(data).hexdigest()
            async with self.lock:
                record = await self.store.get('recording', 'recording-' + id)
                if not record:
                    raise HTTPException(409, 'Start recording first')
                existing = next((c for c in record['chunks'] if c['sequence'] == sequence), None)
                if existing:
                    if existing['sha256'] != digest:
                        raise HTTPException(409, 'Chunk differs from the already saved data')
                    return {'sequence': sequence, 'sha256': digest}
                if record['state'] != 'uploading' or record['bytes'] + len(data) > 300*1024*1024:
                    raise HTTPException(409, 'Recording is sealed or exceeds the 300 MB limit')
                key = f'recordings/{id}/{sequence}.chunk'
                await self.store.put_blob(key, bytes(data), 'application/octet-stream')
                record['chunks'].append({'sequence': sequence, 'key': key, 'sha256': digest})
                record['bytes'] += len(data)
                await self.store.put('recording', record)
            return {'sequence': sequence, 'sha256': digest}

        @app.post('/api/sessions/{id}/recording/complete')
        async def complete(id: str, body: RecordingEnd, request: Request):
            await self.authorize(request, id, user)
            async with self.lock:
                record = await self.store.get('recording', 'recording-' + id)
                if record and record['state'] == 'complete':
                    return self.public(record)
                if not record or sorted(c['sequence'] for c in record['chunks']) != list(range(body.count)):
                    raise HTTPException(409, 'Recording has missing chunks; retry the upload before analysis')
                try:
                    with tempfile.TemporaryDirectory(prefix='showonce-recording-') as temp:
                        path = await self.materialize(record, Path(temp))
                        raw = await asyncio.to_thread(media_command, ['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', str(path)])
                        info = json.loads(raw)
                        duration = round(float(info['format']['duration'])*1000)
                        has_audio = any(s['codec_type']=='audio' for s in info['streams'])
                        if not any(s['codec_type']=='video' for s in info['streams']):
                            raise ValueError('Recording has no video track')
                        if record['audio'] and not has_audio:
                            raise ValueError('Expected narration track is missing')
                        packet_data = await asyncio.to_thread(media_command, ['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_packets', '-show_entries', 'packet=stream_index,pts_time,duration_time', '-of', 'json', str(path)])
                        packets = json.loads(packet_data)['packets']
                        for stream in info['streams']:
                            if stream['codec_type'] not in ('video', 'audio'):
                                continue
                            intervals = sorted((float(p['pts_time']), float(p['pts_time'])+float(p.get('duration_time', 0))) for p in packets if p['stream_index']==stream['index'] and 'pts_time' in p)
                            if not intervals or intervals[0][0] > 1 or intervals[-1][1] < duration/1000-1:
                                raise ValueError(f"{stream['codec_type']} track does not cover the recording")
                            if any(right[0]-left[1] > 1 for left, right in zip(intervals, intervals[1:])):
                                raise ValueError(f"{stream['codec_type']} track has a gap longer than one second")
                        if abs(duration-body.duration_ms) > max(3000, body.duration_ms*.05):
                            raise ValueError('Decoded recording duration differs from the capture clock; review the recording')
                        if duration > 310000:
                            raise ValueError('Recording exceeds five minutes plus flush allowance')
                        # Fully decode both streams, not just the container header.
                        await asyncio.to_thread(media_command, ['ffmpeg', '-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe', '-i', str(path), '-f', 'null', '-'])
                    record.update(state='complete', duration_ms=duration, audio_present=has_audio,
                                  analysis_state='pending', completed_at=time.time())
                    await self.store.put('recording', record)
                except (ValueError, KeyError, subprocess.TimeoutExpired) as exc:
                    raise HTTPException(422, str(exc) if isinstance(exc, ValueError) else 'Recording validation failed')
            return self.public(record)

        @app.get('/api/sessions/{id}/recording')
        async def status(id: str, request: Request):
            await self.authorize(request, id, user)
            record = await self.store.get('recording', 'recording-' + id)
            return self.public(record) if record else {'state': 'not_started'}

    @staticmethod
    def public(record):
        return {k: record.get(k) for k in ('state', 'duration_ms', 'audio_present', 'analysis_state', 'bytes')}

    async def materialize(self, record, directory):
        source = directory / ('source.mp4' if record['mime'].startswith('video/mp4') else 'source.webm')
        with source.open('wb') as out:
            for chunk in sorted(record['chunks'], key=lambda c: c['sequence']):
                data = await self.store.get_blob(chunk['key'])
                if hashlib.sha256(data).hexdigest() != chunk['sha256']:
                    raise ValueError('A saved recording chunk failed its checksum')
                out.write(data)
        # WebM output is accepted by Gemini and has a finalized seekable header.
        if record['mime'].startswith('video/webm'):
            target = directory/'recording.webm'
            await asyncio.to_thread(media_command, ['ffmpeg', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', str(source), '-c', 'copy', str(target)])
        else:
            target = directory/'recording.mp4'
            await asyncio.to_thread(media_command, ['ffmpeg', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', str(source), '-c', 'copy', str(target)])
        return target
