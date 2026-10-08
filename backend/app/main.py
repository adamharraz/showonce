import asyncio
from contextlib import asynccontextmanager
import io
import json
from pathlib import Path
import time
import zipfile
import tempfile
from fastapi import FastAPI, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from .config import Settings
from .storage import Store
from .auth import Auth
from .ai import Gemini
from .services import Service, Runtime, now, validate_draft, publication_errors
from .models import CreateSession, DraftEdit, SetStep, FrameMessage, AudioMessage, uid, SessionRecord, AssessmentRecord, JobRecord, LessonRecord, VersionRecord, SessionDetail

def create_app(settings=None, ai=None):
    settings = settings or Settings()
    settings.validate()
    store = Store(settings)
    auth = Auth(settings, store)
    service = Service(settings, store, ai or Gemini(settings))

    @asynccontextmanager
    async def lifespan(app):
        await service.recover()
        yield
        await service.close()
        await store.close()

    app = FastAPI(title='ShowOnce', version='0.1.0', lifespan=lifespan)
    app.state.store, app.state.auth, app.state.service = store, auth, service
    app.add_middleware(CORSMiddleware, allow_origins=list({settings.origin, 'http://localhost:5173', 'http://127.0.0.1:5173'}), allow_methods=['GET', 'POST', 'PATCH'], allow_headers=['Authorization', 'Content-Type'])

    async def user(request: Request):
        header = request.headers.get('authorization', '')
        return await auth.user(header.removeprefix('Bearer '))

    async def owned(kind, id, current):
        record = await store.get(kind, id)
        if not record:
            raise HTTPException(404, 'Not found')
        if record['owner_id'] != current.id:
            raise HTTPException(403, 'This record belongs to another account')
        return record

    def zip_response(output, name):
        size = output.tell(); output.seek(0)
        def chunks():
            try:
                while data := output.read(65536):
                    yield data
            finally:
                output.close()
        return StreamingResponse(chunks(), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="{name}"', 'Content-Length': str(size)})

    @app.get('/api/config')
    async def config():
        return {'local_login': settings.storage_mode == 'local' and settings.allow_local_login, 'storage_mode': settings.storage_mode, 'ai_configured': bool(settings.gemini_key), 'free_tier_confirmed': settings.free_tier_confirmed, 'supabase_url': settings.supabase_url, 'supabase_anon_key': settings.supabase_anon, 'analysis_interval': settings.interval, 'daily_limit': settings.daily_limit, 'physical_model': 'gemini-robotics-er-2-streaming-preview' if settings.physical_observer == 'er2' else settings.general_model, 'general_model': settings.general_model, 'app_origin': settings.origin}

    @app.get('/api/health')
    async def health():
        return {'status': 'ok', 'ai_ready': bool(settings.gemini_key and settings.free_tier_confirmed)}

    @app.post('/api/auth/local')
    async def local_login(request: Request):
        if not settings.allow_local_login or settings.storage_mode != 'local' or request.client.host not in ('127.0.0.1', '::1', 'testclient'):
            raise HTTPException(403, 'Local sign-in is available only on the developer computer')
        data = await request.json()
        role = data.get('role')
        if role not in ('instructor', 'student'):
            raise HTTPException(422, 'Choose instructor or student')
        return {'token': auth.token(role), 'user': {'id': f'local-{role}', 'role': role}}

    @app.get('/api/me')
    async def me(current=Depends(user)):
        return {'id': current.id, 'role': current.role}

    @app.get('/api/lessons')
    async def lessons(current=Depends(user)):
        records = await store.all('lesson')
        result = []
        for record in records:
            if record['owner_id'] == current.id or record['latest_version']:
                if record['owner_id'] == current.id:
                    draft = record['draft']
                else:
                    published = await store.get('version', f"{record['id']}-v{record['latest_version']}")
                    draft = published['draft']
                result.append({'id': record['id'], 'title': draft['title'], 'summary': draft['summary'], 'step_count': len(draft['steps']), 'latest_version': record['latest_version'], 'owned': record['owner_id'] == current.id, 'created_at': record['created_at']})
        return sorted(result, key=lambda x: x['created_at'], reverse=True)

    @app.get('/api/sessions', response_model=list[SessionRecord])
    async def sessions(current=Depends(user)):
        return sorted([s for s in await store.all('session') if s['owner_id'] == current.id], key=lambda s: s['created_at'], reverse=True)[:30]

    @app.post('/api/sessions', status_code=201, response_model=SessionRecord)
    async def create_session(body: CreateSession, current=Depends(user)):
        if body.mode == 'teach' and current.role != 'instructor':
            raise HTTPException(403, 'Only instructors create demonstrations')
        async with service.session_lock:
            if any(not r.stopped and r.session['state'] not in ('interrupted',) for r in service.runtimes.values()):
                raise HTTPException(409, 'One live session is already active. Finish it before starting another.')
            version = None
            if body.mode == 'practice':
                if not body.lesson_id or not body.version:
                    raise HTTPException(422, 'Choose a published lesson version')
                version = await store.get('version', f'{body.lesson_id}-v{body.version}')
                if not version:
                    raise HTTPException(404, 'Published lesson version not found')
            id = uid()
            session = {'id': id, 'owner_id': current.id, 'mode': body.mode, 'source': body.source, 'state': 'capturing', 'created_at': now(), 'last_analysis_at': None, 'last_error': None, 'title': 'Untitled demonstration' if not version else version['draft']['title'], 'lesson_id': uid() if not version else body.lesson_id, 'version_id': version['id'] if version else None, 'step_id': version['draft']['steps'][0]['id'] if version else None, 'gaps': [], 'published': False, 'model': settings.general_model if body.source == 'screen' else ('gemini-robotics-er-2-streaming-preview' if body.mode == 'teach' and settings.physical_observer == 'er2' else settings.physical_assessor)}
            await store.put('session', session)
            service.runtimes[id] = Runtime(session, service)
        return session

    @app.get('/api/sessions/{id}', response_model=SessionDetail)
    async def get_session(id: str, current=Depends(user)):
        session = await owned('session', id, current)
        return {'session': session, 'observations': await service.observations(id), 'assessments': [a for a in await store.all('assessment') if a['session_id'] == id], 'job': await store.get('job', 'job-' + id)}

    @app.post('/api/sessions/{id}/capture-ticket')
    async def capture_ticket(id: str, current=Depends(user)):
        session = await owned('session', id, current)
        if session['source'] != 'phone' or session['state'] not in ('capturing', 'paused'):
            raise HTTPException(409, 'Phone pairing is available only for an active phone session')
        return {'ticket': auth.ticket(id, current.id), 'session_id': id, 'expires_in': 120, 'url': f'{settings.origin}/capture/{id}'}

    @app.get('/api/sessions/{id}/evidence/export')
    async def export_session(id: str, current=Depends(user)):
        session = await owned('session', id, current)
        data = {'session': session, 'observations': await service.observations(id), 'assessments': [a for a in await store.all('assessment') if a['session_id'] == id], 'metrics': [m for m in await store.all('metric') if m['session_id'] == id], 'job': await store.get('job', 'job-' + id), 'audio_retained': False}
        output = tempfile.SpooledTemporaryFile(max_size=16000000, dir=settings.data_dir)
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('evidence.json', json.dumps(data, indent=2))
            for frame_id in [f['id'] for f in await store.all('frame') if f['session_id'] == id]:
                for f in await service.frames_by_ids([frame_id]):
                    archive.writestr(f"screenshots/{f['id']}.jpg", f['bytes'])
        return zip_response(output, 'showonce-evidence.zip')

    @app.post('/api/sessions/{id}/finalize', status_code=202, response_model=JobRecord)
    async def finalize(id: str, current=Depends(user)):
        session = await owned('session', id, current)
        if session['mode'] != 'teach':
            raise HTTPException(409, 'Student practice does not create a tutorial')
        runtime = service.runtimes.get(id)
        if runtime and not runtime.stopped:
            await runtime.finish()
            session = runtime.session
        else:
            session['state'] = 'finished'; session['finished_at'] = now()
            await store.put('session', session)
        return await service.enqueue(session)

    @app.post('/api/sessions/{id}/finish', response_model=SessionRecord)
    async def finish_session(id: str, current=Depends(user)):
        session = await owned('session', id, current)
        runtime = service.runtimes.get(id)
        if runtime and not runtime.stopped:
            await runtime.finish()
            return runtime.session
        session['state'] = 'finished'; session['finished_at'] = now()
        await store.put('session', session)
        return session

    @app.post('/api/sessions/{id}/step', response_model=SessionRecord)
    async def set_step(id: str, body: SetStep, current=Depends(user)):
        async with service.session_lock:
            session = await owned('session', id, current)
            if session['mode'] != 'practice' or session['state'] == 'finished':
                raise HTTPException(409, 'Choose a step in an active practice session')
            version = await store.get('version', session['version_id'])
            if body.step_id not in {s['id'] for s in version['draft']['steps']}:
                raise HTTPException(422, 'Step is not part of this lesson version')
            session['step_id'] = body.step_id
            session['step_revision'] = session.get('step_revision', 0) + 1
            runtime = service.runtimes.get(id)
            if runtime:
                async with runtime.storage_lock:
                    runtime.session['step_id'] = body.step_id
                    runtime.session['step_revision'] = session['step_revision']
                    await runtime.mark_processed(runtime.frames)
                    runtime.frames.clear(); runtime.audio.clear()
            await store.put('session', session)
            return session

    @app.get('/api/lessons/{id}/draft', response_model=LessonRecord)
    async def get_draft(id: str, current=Depends(user)):
        return await owned('lesson', id, current)

    @app.patch('/api/lessons/{id}/draft', response_model=LessonRecord)
    async def edit_draft(id: str, body: DraftEdit, current=Depends(user)):
        async with service.session_lock:
            lesson = await owned('lesson', id, current)
            if lesson['revision'] != body.revision:
                raise HTTPException(409, 'The draft changed. Reload before saving.')
            allowed = [f['id'] for f in await store.all('frame') if f['session_id'] == lesson['session_id']]
            try:
                validate_draft(body.draft, allowed)
            except ValueError as exc:
                raise HTTPException(422, str(exc))
            lesson['draft'] = body.draft.model_dump(); lesson['revision'] += 1
            await store.put('lesson', lesson)
            return lesson

    @app.post('/api/lessons/{id}/revise', response_model=LessonRecord)
    async def revise_draft(id: str, request: Request, current=Depends(user)):
        body = await request.json()
        lesson = await owned('lesson', id, current)
        if body.get('revision') != lesson['revision']:
            raise HTTPException(409, 'Save the current draft before applying clarifications')
        snapshot = lesson['revision']
        from .models import LessonDraft
        original = LessonDraft.model_validate(lesson['draft'])
        ids = list(dict.fromkeys(f for step in original.steps for f in step.evidence_ids))
        frames = await service.frames_by_ids(ids)
        started = time.monotonic()
        from .ai import AIError
        try:
            async with service.ai_lock:
                await service.reserve_call()
                revised = await service.ai.revise(original.model_dump(), frames)
            validate_draft(revised, ids)
        except (AIError, ValueError) as exc:
            if isinstance(exc, AIError) and exc.code == 'quota':
                await service.block_quota()
            raise HTTPException(503, str(exc))
        old_questions = [*original.questions, *(q for s in original.steps for q in s.questions)]
        new_questions = {q.id: q for q in [*revised.questions, *(q for s in revised.steps for q in s.questions)]}
        for question in old_questions:
            if question.answer or question.required:
                if question.id in new_questions:
                    new_questions[question.id].answer = question.answer
                    new_questions[question.id].required = question.required
                else:
                    revised.questions.append(question)
        try:
            revised = LessonDraft.model_validate(revised.model_dump())
        except ValueError:
            raise HTTPException(503, 'The revised lesson could not preserve all required questions within its limits. Saved edits remain unchanged; revise manually.')
        async with service.session_lock:
            latest = await owned('lesson', id, current)
            if latest['revision'] != snapshot:
                raise HTTPException(409, 'The draft changed during AI revision. Saved edits were preserved; reload before retrying.')
            latest['draft'] = revised.model_dump(); latest['revision'] += 1
            await store.put('lesson', latest)
        await store.put('metric', {'id': uid(), 'owner_id': current.id, 'session_id': lesson['session_id'], 'operation': 'revision', 'model': service.ai.actual_model, 'latency_ms': round((time.monotonic()-started)*1000), 'usage': service.ai.last_usage, 'created_at': now()})
        return latest

    @app.post('/api/lessons/{id}/publish', response_model=VersionRecord)
    async def publish(id: str, request: Request, current=Depends(user)):
        body = await request.json()
        if body.get('reviewed') is not True:
            raise HTTPException(422, 'Confirm that you reviewed instructions, references and checkpoints')
        async with service.session_lock:
            lesson = await owned('lesson', id, current)
            if body.get('revision') != lesson['revision']:
                raise HTTPException(409, 'Save or reload the current draft before publishing')
            from .models import LessonDraft
            draft = LessonDraft.model_validate(lesson['draft'])
            errors = publication_errors(draft)
            if errors:
                raise HTTPException(422, {'message': 'Resolve required details before publication', 'questions': errors})
            number = lesson['latest_version'] + 1
            version = {'id': f'{id}-v{number}', 'owner_id': current.id, 'lesson_id': id, 'version': number, 'draft': draft.model_dump(), 'published_at': now()}
            await store.put('version', version)
            lesson['latest_version'] = number
            await store.put('lesson', lesson)
            session = await store.get('session', lesson['session_id'])
            session['published'] = True
            await store.put('session', session)
        await service.cleanup()
        return version

    @app.get('/api/lessons/{id}/versions/{version}', response_model=VersionRecord)
    async def get_version(id: str, version: int, current=Depends(user)):
        record = await store.get('version', f'{id}-v{version}')
        if not record:
            raise HTTPException(404, 'Published lesson not found')
        return record

    @app.get('/api/frames/{id}')
    async def frame(id: str, current=Depends(user)):
        f = await store.get('frame', id)
        if not f:
            raise HTTPException(404, 'Screenshot not found')
        if f['owner_id'] != current.id:
            published_ids = {i for v in await store.all('version') for s in v['draft']['steps'] for i in s['evidence_ids']}
            if id not in published_ids:
                raise HTTPException(403, 'Screenshot is private')
        return Response(await store.get_blob(f['key']), media_type='image/jpeg', headers={'Cache-Control': 'private, max-age=3600'})

    @app.get('/api/lessons/{id}/versions/{version}/export')
    async def export(id: str, version: int, format: str = 'bundle', current=Depends(user)):
        record = await get_version(id, version, current)
        d = record['draft']
        lines = [f"# {d['title']}", '', d['summary'], '', '## Materials', *['- ' + m for m in d['materials']], '']
        for n, s in enumerate(d['steps'], 1):
            lines.extend([f"## {n}. {s['title']}", '', s['instruction'], '', f"Expected outcome: {s['expected_outcome']}", f"Evidence time: {s['timestamp_ms']/1000:.1f}s", f"Source: {s['provenance']}", *[f"- {c['description']} ({c['mode']} check)" for c in s['criteria']], *[f"Clarification: {q['text']} — {q['answer']}" for q in s['questions'] if q['answer']], ''])
            if format == 'bundle':
                lines.extend(f"![Reference](screenshots/{fid}.jpg)" for fid in s['evidence_ids'])
        lines.extend(f"Clarification: {q['text']} — {q['answer']}" for q in d['questions'] if q['answer'])
        markdown = '\n'.join(lines)
        if format == 'markdown':
            return Response(markdown, media_type='text/markdown', headers={'Content-Disposition': 'attachment; filename="showonce-lesson.md"'})
        if format != 'bundle':
            raise HTTPException(422, 'Choose markdown or bundle')
        output = tempfile.SpooledTemporaryFile(max_size=16000000, dir=settings.data_dir)
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('lesson.json', json.dumps(record, indent=2))
            archive.writestr('lesson.md', markdown)
            for frame_id in dict.fromkeys(f for s in d['steps'] for f in s['evidence_ids']):
                for f in await service.frames_by_ids([frame_id]):
                    archive.writestr(f"screenshots/{f['id']}.jpg", f['bytes'])
        return zip_response(output, 'showonce-lesson.zip')

    @app.websocket('/api/sessions/{id}/stream')
    async def stream(ws: WebSocket, id: str):
        allowed_origins = {settings.origin, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8000', 'http://127.0.0.1:8000'}
        if ws.headers.get('origin') not in allowed_origins:
            await ws.close(code=1008); return
        await ws.accept()
        runtime = None
        producer = False
        producer_attached = False
        try:
            hello = await asyncio.wait_for(ws.receive_json(), 10)
            if hello.get('type') != 'authenticate':
                raise HTTPException(401, 'Authenticate first')
            if hello.get('ticket'):
                ticket = auth.consume_ticket(hello['ticket'], id)
                session = await store.get('session', id)
                if not session or session['owner_id'] != ticket['user_id'] or session['source'] != 'phone':
                    raise HTTPException(403, 'Capture ticket does not match this session')
                producer = True
            else:
                current = await auth.user(hello.get('token', ''))
                session = await owned('session', id, current)
            runtime = service.runtimes.get(id)
            if not runtime or runtime.stopped:
                if producer or session['state'] == 'finished':
                    raise HTTPException(409, 'Session is no longer live')
                async with service.session_lock:
                    if any(not r.stopped for r in service.runtimes.values()):
                        raise HTTPException(409, 'Finish the other active session first')
                    # Recovery never invents observations from the missing interval.
                    runtime = Runtime(session, service); service.runtimes[id] = runtime
                    runtime.frames = await service.frames_by_ids([f['id'] for f in await store.all('frame') if f['session_id'] == id and not f.get('processed', False) and (session['mode'] == 'teach' or f.get('step_id') == session['step_id'])])
            if producer:
                if getattr(runtime, 'producer', None):
                    raise HTTPException(409, 'A phone is already connected')
                runtime.producer = ws
                producer_attached = True
                await ws.send_json({'type': 'paired', 'mode': session['mode'], 'elapsed_ms': max(0, round((time.time() - __import__('datetime').datetime.fromisoformat(session['created_at']).timestamp())*1000))})
                await runtime.emit('notice', message='Phone connected. The instructor or student controls the session from the main page.')
            else:
                runtime.sockets.add(ws)
                await ws.send_json({'type': 'status', 'session': runtime.session})
            while not runtime.stopped:
                message = await asyncio.wait_for(ws.receive_json(), 35)
                if len(json.dumps(message)) > 1500000:
                    raise ValueError('Message is too large')
                type = message.get('type')
                if type == 'ping':
                    await ws.send_json({'type': 'pong', 'state': runtime.session['state']}); continue
                if type in ('frame', 'audio'):
                    if not producer and runtime.session['source'] == 'phone':
                        raise ValueError('This session uses the paired phone for capture')
                    if type == 'frame':
                        async with runtime.storage_lock:
                            await runtime.frame(FrameMessage.model_validate(message))
                    elif runtime.session['state'] == 'capturing':
                        if runtime.elapsed_ms >= runtime.limit_ms:
                            runtime.session['state'] = 'paused'
                            await runtime.save(); await runtime.emit('status', session=runtime.session)
                            await runtime.finish()
                            continue
                        import base64
                        m = AudioMessage.model_validate(message)
                        raw = base64.b64decode(m.data, validate=True)
                        if len(raw) % 2 or len(raw) > 64000:
                            raise ValueError('Invalid PCM chunk')
                        if len(runtime.audio) + len(raw) > 16000 * 2 * 40:
                            runtime.session['state'] = 'paused'
                            runtime.session['gaps'].append({'timestamp_ms': m.timestamp_ms, 'reason': 'Audio buffer full. Capture paused; clarify any missing narration.'})
                            await runtime.save(); await runtime.emit('status', session=runtime.session)
                        else:
                            runtime.audio.extend(raw)
                elif type == 'control':
                    if producer:
                        raise ValueError('Phone capture tickets cannot control the session')
                    if message.get('audio_gap') is True:
                        runtime.session['gaps'].append({'timestamp_ms': round(runtime.elapsed_ms), 'reason': 'The microphone could not flush its final audio chunk. Confirm essential narration at the end of the demonstration.'})
                    action = message.get('action')
                    if action in ('pause', 'resume'):
                        if action == 'resume' and (runtime.session['state'] == 'quota_paused' or (runtime.session.get('last_error') or {}).get('code') in ('quota', 'daily_limit')):
                            raise ValueError('Quota pause cannot be overridden in this session')
                        runtime.session['state'] = 'paused' if action == 'pause' else 'capturing'
                        if action == 'resume':
                            runtime.session['last_error'] = None
                        await runtime.save(); await runtime.emit('status', session=runtime.session)
                    elif action == 'finish':
                        await runtime.finish()
                    else:
                        raise ValueError('Unknown control')
                else:
                    raise ValueError('Unknown message')
        except (HTTPException, ValueError, asyncio.TimeoutError) as exc:
            try:
                await ws.send_json({'type': 'error', 'message': str(exc.detail if isinstance(exc, HTTPException) else exc) or 'Capture connection timed out'})
                await ws.close(code=1008)
            except Exception:
                pass
        except WebSocketDisconnect:
            pass
        finally:
            if runtime:
                runtime.sockets.discard(ws)
                if producer_attached and getattr(runtime, 'producer', None) is ws:
                    runtime.producer = None
                if not runtime.stopped and (producer_attached or (not producer and runtime.session['source'] != 'phone')):
                    if runtime.session['state'] != 'quota_paused':
                        runtime.session['state'] = 'paused'
                    runtime.session['gaps'].append({'timestamp_ms': 0, 'reason': 'Capture connection disconnected. Confirm any actions during the interruption.'})
                    await runtime.save()
                    await runtime.emit('status', session=runtime.session)

    dist = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
    if (dist / 'assets').exists():
        app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')

    @app.get('/{path:path}')
    async def spa(path: str):
        if path.startswith('api/'):
            raise HTTPException(404, 'API route not found')
        if not (dist / 'index.html').exists():
            return Response('Frontend not built. Run npm install and npm run build in frontend, or npm run dev.', media_type='text/plain', status_code=503)
        return FileResponse(dist / 'index.html')

    return app

app = create_app()
