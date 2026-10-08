import asyncio
import base64
from datetime import datetime, timezone, timedelta
import io
import json
import logging
import time
from PIL import Image, ImageOps
from fastapi import HTTPException
from .ai import AIError, ER2Stream
from .models import uid, ObservationBatch, LessonDraft, AssessmentOutput

log = logging.getLogger('showonce')

def now():
    return datetime.now(timezone.utc).isoformat()

def validate_evidence(ids, allowed):
    if not set(ids).issubset(set(allowed)):
        raise ValueError('Evidence references must belong to the supplied demonstration')

def validate_draft(draft, allowed):
    for step in draft.steps:
        validate_evidence(step.evidence_ids, allowed)
        if step.provenance == 'visible' and not step.evidence_ids:
            raise ValueError('Visible steps require screenshot evidence')

def publication_errors(draft):
    errors = []
    if not draft.steps:
        errors.append('A lesson needs at least one reviewed step')
    for q in [*draft.questions, *(q for s in draft.steps for q in s.questions)]:
        if q.required and not q.answer.strip():
            errors.append(q.text)
    for step in draft.steps:
        if any(c.mode == 'visual' for c in step.criteria) and not step.evidence_ids:
            errors.append(f'{step.title}: visual checking needs reference evidence')
    return errors

def guard_assessment(step, result, student_ids):
    validate_evidence(result.evidence_ids, student_ids)
    visual = {c['id'] for c in step['criteria'] if c['mode'] == 'visual'}
    by_id = {}
    for c in result.criteria:
        if c.criterion_id not in visual or c.criterion_id in by_id:
            raise ValueError('Invalid or duplicate criterion result')
        validate_evidence(c.evidence_ids, student_ids)
        by_id[c.criterion_id] = c
    if result.outcome == 'met' and (not visual or set(by_id) != visual or any(not c.supported or not c.evidence_ids for c in by_id.values())):
        result.outcome = 'clearer_view'
        result.explanation = 'Not every visual criterion has supporting evidence. Show the completed step clearly.'
    if result.outcome == 'correction' and not result.evidence_ids:
        result.outcome = 'clearer_view'
        result.explanation = 'A correction could not be anchored to visible student evidence.'
    return result

class Runtime:
    def __init__(self, session, service):
        self.session, self.service = session, service
        self.frames, self.audio = [], bytearray()
        self.sockets = set()
        self.analysis_lock = asyncio.Lock()
        self.finish_lock = asyncio.Lock()
        self.storage_lock = asyncio.Lock()
        self.last_frame = 0.
        self.stream = None
        self.stopped = False
        self.last_media = time.monotonic()
        self.live_reconnects = 0
        self.task = asyncio.create_task(self.loop())

    async def emit(self, type, **data):
        if type == 'status' and getattr(self, 'producer', None):
            try:
                await self.producer.send_json({'type': 'capture_state', 'state': self.session['state']})
            except Exception:
                pass
        for ws in list(self.sockets):
            try:
                await ws.send_json({'type': type, **data})
            except Exception:
                self.sockets.discard(ws)

    async def frame(self, msg):
        if self.session['state'] != 'capturing':
            return
        if self.elapsed_ms >= self.limit_ms:
            self.session['state'] = 'paused'
            await self.save(); await self.emit('status', session=self.session)
            await self.finish()
            return
        if time.monotonic() - self.last_frame < .8:
            raise ValueError('Capture is limited to one frame per second')
        self.last_frame = time.monotonic()
        self.last_media = self.last_frame
        raw = base64.b64decode(msg.data, validate=True)
        if len(raw) > 1000000:
            raise ValueError('Frame is too large')
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > 12000000:
                raise ValueError('Frame dimensions are too large')
            image = ImageOps.exif_transpose(image).convert('RGB')
            if image.width > 1600:
                image = image.resize((1600, round(image.height * 1600 / image.width)))
            output = io.BytesIO(); image.save(output, format='JPEG', quality=82)
        id = f"{self.session['id']}-{msg.id}"
        if await self.service.store.get('frame', id):
            return
        frame = {'id': id, 'owner_id': self.session['owner_id'], 'session_id': self.session['id'], 'step_id': self.session.get('step_id'), 'processed': False, 'timestamp_ms': min(msg.timestamp_ms, self.limit_ms), 'key': f"{self.session['id']}/{msg.id}.jpg", 'created_at': now()}
        await self.service.store.put_blob(frame['key'], output.getvalue())
        await self.service.store.put('frame', frame)
        self.frames.append({**frame, 'bytes': output.getvalue()})
        if len(self.frames) > 40:
            self.session['state'] = 'paused'
            self.session['gaps'].append({'timestamp_ms': msg.timestamp_ms, 'reason': 'Analysis backlog exceeded 40 frames. Capture paused; all received frames remain saved.'})
            await self.save()
            await self.emit('status', session=self.session)
            return
        if self.stream:
            try:
                await self.stream.frame(self.frames[-1])
            except Exception as exc:
                # Let the serialized analysis path reconnect. Closing a live
                # stream here could cancel an observation already in flight.
                failure = exc if isinstance(exc, AIError) else self.service.ai.classify(exc)
                self.stream.error = failure
                self.stream.done.set()
                if failure.code == 'quota':
                    await self.service.block_quota()
                    self.session['state'] = 'quota_paused'
                    self.session['quota_date'] = datetime.now(timezone.utc).date().isoformat()
                    self.session['last_error'] = {'code': 'quota', 'message': str(failure)}
                    await self.save(); await self.emit('status', session=self.session)
                else:
                    await self.emit('notice', message='Live observation disconnected. Received frames are saved; recovery will run at the next analysis window.')
        await self.emit('frame_saved', frame={k: v for k, v in frame.items() if k != 'key'})

    @property
    def limit_ms(self):
        return 300000 if self.session['mode'] == 'teach' else 600000

    @property
    def elapsed_ms(self):
        return (datetime.now(timezone.utc) - datetime.fromisoformat(self.session['created_at'])).total_seconds() * 1000

    async def save(self):
        await self.service.store.put('session', self.session)

    async def drop_stream(self, exc):
        stream, self.stream = self.stream, None
        if stream:
            await stream.close()
        if getattr(exc, 'code', '') == 'quota':
            await self.service.block_quota()
            self.session['state'] = 'quota_paused'
            self.session['quota_date'] = datetime.now(timezone.utc).date().isoformat()
            self.session['last_error'] = {'code': 'quota', 'message': str(exc)}
            await self.save()
            await self.emit('status', session=self.session)
            return
        if getattr(exc, 'code', '') == 'connection' and self.live_reconnects == 0:
            self.live_reconnects += 1
            resumed = ER2Stream(self.service.ai)
            resumed.handle = stream.handle if stream else None
            try:
                await resumed.open()
                self.stream = resumed
                await self.emit('notice', message='ER2 reconnected once. The observation ledger and received images are preserved.')
                return
            except AIError as retry_error:
                await resumed.close()
                if retry_error.code == 'quota':
                    await self.service.block_quota()
                    self.session['state'] = 'quota_paused'
                    self.session['quota_date'] = datetime.now(timezone.utc).date().isoformat()
                    self.session['last_error'] = {'code': 'quota', 'message': str(retry_error)}
                    await self.save(); await self.emit('status', session=self.session)
                    return
        self.session['model'] = self.service.settings.general_model
        await self.emit('notice', message='ER2 live observation is unavailable. Continuing with window-based Gemini analysis of the same demonstration.')
        await self.save()

    async def setup_stream(self):
        if self.session['mode'] != 'teach' or self.session['source'] == 'screen' or self.service.settings.physical_observer != 'er2':
            return
        try:
            self.stream = ER2Stream(self.service.ai)
            await self.stream.open()
        except AIError as exc:
            if exc.code in ('quota', 'budget_guard', 'not_configured'):
                self.stream = None
                if exc.code == 'quota':
                    await self.service.block_quota()
                    self.session['state'] = 'quota_paused'
                    self.session['quota_date'] = datetime.now(timezone.utc).date().isoformat()
                    self.session['last_error'] = {'code': 'quota', 'message': str(exc)}
                    await self.save(); await self.emit('status', session=self.session)
                await self.emit('notice', message=str(exc))
            else:
                await self.drop_stream(exc)

    async def loop(self):
        try:
            await self.setup_stream()
            next_update = time.monotonic() + self.service.settings.interval
            while not self.stopped:
                await asyncio.sleep(max(0, next_update - time.monotonic()))
                next_update = time.monotonic() + self.service.settings.interval
                if self.elapsed_ms >= self.limit_ms:
                    await self.finish()
                    break
                if self.session['state'] in ('capturing', 'paused') and self.frames and not self.session.get('last_error'):
                    await self.analyze()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception('session_loop_failed')
            self.session['state'] = 'interrupted'
            await self.save()
            await self.emit('status', session=self.session)

    async def analyze(self):
        async with self.analysis_lock:
            if not self.frames or self.session['state'] in ('quota_paused', 'finished', 'interrupted'):
                return
            batch = list(self.frames)
            pcm = bytes(self.audio)
            self.audio.clear()
            started = time.monotonic()
            step_id = self.session.get('step_id')
            step_revision = self.session.get('step_revision', 0)
            try:
                async with self.service.ai_lock:
                    await self.service.reserve_call()
                    if self.session['mode'] == 'teach':
                        ledger = await self.service.observations(self.session['id'])
                        if self.stream:
                            try:
                                result = await self.stream.observe(ledger, batch, pcm)
                            except AIError as exc:
                                if exc.code == 'quota':
                                    raise
                                await self.drop_stream(exc)
                                if self.session['state'] == 'quota_paused':
                                    raise AIError('Free quota exhausted; AI calls stopped.', 'quota')
                                # Flash recovers the affected saved window. A resumed stream
                                # receives future frames at 1 FPS instead of a replay burst.
                                result = await self.service.ai.observe(ledger, batch, pcm)
                        else:
                            result = await self.service.ai.observe(ledger, batch, pcm)
                        await self.service.accept_observations(self.session, result, batch)
                        await self.emit('observations', observations=await self.service.observations(self.session['id']))
                    else:
                        version = await self.service.store.get('version', self.session['version_id'])
                        step = next((s for s in version['draft']['steps'] if s['id'] == step_id), None)
                        if not step:
                            raise AIError('Select a lesson step before checking.', 'invalid_step')
                        if not any(c['mode'] == 'visual' for c in step['criteria']):
                            result = AssessmentOutput(outcome='unavailable', explanation='This step requires manual confirmation. The camera cannot establish its required outcome.')
                        else:
                            references = await self.service.frames_by_ids(step['evidence_ids'][:3])
                            student = batch[-3:]
                            result = await self.service.ai.assess(step, references, student, self.session['source'] != 'screen')
                            guard_assessment(step, result, [f['id'] for f in student])
                        if self.session.get('step_id') != step_id or self.session.get('step_revision', 0) != step_revision:
                            await self.mark_processed(batch)
                            self.frames = [f for f in self.frames if f['id'] not in {x['id'] for x in batch}]
                            return
                        assessment = {**result.model_dump(), 'id': uid(), 'owner_id': self.session['owner_id'], 'session_id': self.session['id'], 'version_id': self.session['version_id'], 'step_id': step_id, 'step_revision': step_revision, 'latency_ms': round((time.monotonic() - started) * 1000), 'created_at': now(), 'manual_unverified': [c['description'] for c in step['criteria'] if c['mode'] == 'manual']}
                        await self.service.store.put('assessment', assessment)
                        await self.emit('assessment', assessment=assessment)
                await self.mark_processed(batch)
                self.frames = [f for f in self.frames if f['id'] not in {x['id'] for x in batch}]
                self.session['last_analysis_at'] = now()
                self.session['model'] = getattr(self.service.ai, 'actual_model', None) or self.session['model']
                if self.session['state'] != 'quota_paused':
                    self.session['last_error'] = None
                await self.service.store.put('metric', {'id': uid(), 'owner_id': self.session['owner_id'], 'session_id': self.session['id'], 'model': self.session['model'], 'latency_ms': round((time.monotonic()-started)*1000), 'usage': self.service.ai.last_usage, 'created_at': now()})
            except (AIError, ValueError) as exc:
                code = getattr(exc, 'code', 'invalid_output')
                self.session['last_error'] = {'code': code, 'message': str(exc)}
                if code in ('quota', 'daily_limit'):
                    if code == 'quota':
                        await self.service.block_quota()
                    self.session['state'] = 'quota_paused'
                    self.session['quota_date'] = datetime.now(timezone.utc).date().isoformat()
                else:
                    self.session['state'] = 'paused'
                self.audio[:0] = pcm
                await self.emit('notice', message=str(exc))
            except Exception:
                self.session['state'] = 'paused'
                self.session['last_error'] = {'code': 'service_error', 'message': 'Analysis failed. Received evidence is preserved; resume to retry.'}
                self.audio[:0] = pcm
                log.warning('analysis_service_error session=%s', self.session['id'])
            await self.save()
            await self.emit('status', session=self.session)

    async def mark_processed(self, frames):
        for frame in frames:
            await self.service.store.put('frame', {k: v for k, v in {**frame, 'processed': True}.items() if k != 'bytes'})

    async def finish(self):
        async with self.finish_lock:
            await self._finish()

    async def _finish(self):
        if self.stopped:
            return
        if self.frames and self.session['state'] not in ('quota_paused', 'interrupted'):
            await self.analyze()
        self.stopped = True
        if self.stream:
            await self.stream.close()
            self.stream = None
        self.session['state'] = 'finished'
        if self.frames:
            self.session['gaps'].append({'timestamp_ms': self.frames[0]['timestamp_ms'], 'reason': 'Some captured evidence was not analyzed. Review missing actions before publication.'})
        self.session['finished_at'] = now()
        self.audio.clear()
        await self.save()
        await self.emit('status', session=self.session)
        if self.session['mode'] == 'teach' and (self.session.get('last_error') or {}).get('code') not in ('quota', 'daily_limit') and await self.service.observations(self.session['id']):
            await self.service.enqueue(self.session)

class Service:
    def __init__(self, settings, store, ai):
        self.settings, self.store, self.ai = settings, store, ai
        self.runtimes = {}
        self.ai_lock = asyncio.Lock()
        self.session_lock = asyncio.Lock()
        self.jobs = set()
        self.enqueue_lock = asyncio.Lock()
        self.usage_lock = asyncio.Lock()
        self.cleanup_task = None

    async def reserve_call(self):
        async with self.usage_lock:
            await self._reserve_call()

    async def block_quota(self):
        async with self.usage_lock:
            id = 'usage-' + datetime.now(timezone.utc).date().isoformat()
            usage = await self.store.get('usage', id) or {'id': id, 'owner_id': '', 'count': 0}
            usage['quota_blocked'] = True
            await self.store.put('usage', usage)

    async def _reserve_call(self):
        self.ai.ready()
        date = datetime.now(timezone.utc).date().isoformat()
        id = f'usage-{date}'
        usage = await self.store.get('usage', id) or {'id': id, 'owner_id': '', 'count': 0}
        if usage.get('quota_blocked'):
            raise AIError('Free quota was exhausted. The daily guard has stopped further AI calls; saved work remains available.', 'quota')
        if usage['count'] >= self.settings.daily_limit:
            raise AIError('The configured daily AI-call limit was reached. Saved work is preserved.', 'daily_limit')
        usage['count'] += 1
        await self.store.put('usage', usage)

    async def recover(self):
        for session in await self.store.all('session'):
            if session['state'] in ('capturing', 'paused', 'quota_paused'):
                session['state'] = 'interrupted'
                session['gaps'].append({'timestamp_ms': 0, 'reason': 'Backend restarted. Resume capture or finalize the preserved observations.'})
                await self.store.put('session', session)
        for job in await self.store.all('job'):
            if job['state'] in ('queued', 'running'):
                job['state'] = 'interrupted'
                job['error'] = 'Backend restarted. Retry finalization explicitly.'
                await self.store.put('job', job)
        await self.cleanup()
        self.cleanup_task = asyncio.create_task(self.retention_loop())

    async def retention_loop(self):
        while True:
            await asyncio.sleep(3600)
            try:
                await self.cleanup()
            except Exception:
                log.warning('retention_cleanup_failed')

    async def cleanup(self):
        sessions = {s['id']: s for s in await self.store.all('session')}
        retained = {f for v in await self.store.all('version') for s in v['draft']['steps'] for f in s['evidence_ids']}
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        for frame in await self.store.all('frame'):
            session = sessions.get(frame['session_id'], {})
            expired = session.get('mode') == 'practice' and datetime.fromisoformat(frame['created_at']) < cutoff
            unused = session.get('published', False) and frame['id'] not in retained
            if expired or unused:
                await self.store.delete_blob(frame['key'])
                await self.store.delete('frame', frame['id'])

    async def observations(self, session_id):
        obs = [o for o in await self.store.all('observation') if o['session_id'] == session_id]
        replaced = {o.get('replaces_observation_id') for o in obs}
        return sorted([o for o in obs if o['id'] not in replaced], key=lambda o: o['timestamp_ms'])

    async def frames_by_ids(self, ids):
        result = []
        for id in ids:
            f = await self.store.get('frame', id)
            if f:
                result.append({**f, 'bytes': await self.store.get_blob(f['key'])})
        return result

    async def accept_observations(self, session, result, frames):
        allowed = [f['id'] for f in frames]
        existing = await self.observations(session['id'])
        known = {o['id'] for o in existing}
        signature = lambda o: (o['action'], o['timestamp_ms'], tuple(o['evidence_ids']), o['provenance'], o['expected_outcome'])
        seen = {signature(o) for o in existing}
        low, high = min(f['timestamp_ms'] for f in frames), max(f['timestamp_ms'] for f in frames)
        for o in result.observations:
            validate_evidence(o.evidence_ids, allowed)
            if o.provenance == 'visible' and not o.evidence_ids:
                raise ValueError('Visible observations require evidence')
            if o.replaces_observation_id and o.replaces_observation_id not in known:
                raise ValueError('Correction refers to an unknown observation')
            if o.timestamp_ms < low or o.timestamp_ms > high:
                raise ValueError('Observation timestamp lies outside the supplied window')
        for o in result.observations:
            value = signature(o.model_dump())
            if value in seen and not o.replaces_observation_id:
                continue
            o.id = uid()
            await self.store.put('observation', {**o.model_dump(), 'owner_id': session['owner_id'], 'session_id': session['id']})
            seen.add(value)
        if result.task_title:
            session['title'] = result.task_title

    async def enqueue(self, session):
        async with self.enqueue_lock:
            return await self._enqueue(session)

    async def _enqueue(self, session):
        if (session.get('last_error') or {}).get('code') in ('quota', 'daily_limit') and session.get('quota_date') == datetime.now(timezone.utc).date().isoformat():
            raise HTTPException(409, 'AI quota was exhausted. Saved work is preserved. Retry finalization after the quota resets; no further calls will be made today for this session.')
        previous = await self.store.get('job', 'job-' + session['id'])
        if previous and previous['state'] in ('queued', 'running', 'complete'):
            return previous
        if not await self.observations(session['id']):
            raise HTTPException(409, 'No AI observations are available yet. Configure AI before starting a new live demonstration; no tutorial will be invented.')
        job = {'id': 'job-' + session['id'], 'owner_id': session['owner_id'], 'session_id': session['id'], 'state': 'queued', 'attempts': (previous or {}).get('attempts', 0), 'error': None}
        await self.store.put('job', job)
        task = asyncio.create_task(self.finalize(session, job))
        self.jobs.add(task); task.add_done_callback(self.jobs.discard)
        return job

    async def finalize(self, session, job):
        started = time.monotonic()
        try:
            job['state'] = 'running'; job['attempts'] += 1
            await self.store.put('job', job)
            ledger = await self.observations(session['id'])
            ids = list(dict.fromkeys(f for o in ledger for f in o['evidence_ids']))
            frames = await self.frames_by_ids(ids)
            async with self.ai_lock:
                await self.reserve_call()
                draft = await self.ai.finalize(ledger, frames, session['gaps'])
            validate_draft(draft, ids)
            await self.store.put('metric', {'id': uid(), 'owner_id': session['owner_id'], 'session_id': session['id'], 'operation': 'finalization', 'model': self.ai.actual_model, 'latency_ms': round((time.monotonic()-started)*1000), 'usage': self.ai.last_usage, 'created_at': now()})
            if session['gaps']:
                from .models import Question
                draft.questions.append(Question(text='The capture has gaps. Confirm the missing actions and add any omitted instructions before publication.', required=True))
            lesson = {'id': session['lesson_id'], 'owner_id': session['owner_id'], 'session_id': session['id'], 'revision': 0, 'latest_version': 0, 'draft': draft.model_dump(), 'created_at': now()}
            await self.store.put('lesson', lesson)
            job['state'] = 'complete'
            job['lesson_id'] = lesson['id']
        except Exception as exc:
            job['state'] = 'failed'
            if isinstance(exc, AIError) and exc.code == 'quota':
                await self.block_quota()
                session['last_error'] = {'code': 'quota', 'message': str(exc)}
                session['quota_date'] = datetime.now(timezone.utc).date().isoformat()
                await self.store.put('session', session)
            job['error'] = str(exc) if isinstance(exc, (AIError, ValueError)) else 'Finalization failed; saved observations remain available.'
            log.warning('finalization_failed type=%s', type(exc).__name__)
        await self.store.put('job', job)
        runtime = self.runtimes.get(session['id'])
        if runtime:
            await runtime.emit('job', job=job)

    async def close(self):
        if self.cleanup_task:
            self.cleanup_task.cancel()
        for runtime in self.runtimes.values():
            runtime.task.cancel()
        for task in self.jobs:
            task.cancel()
        tasks = [r.task for r in self.runtimes.values()] + list(self.jobs) + ([self.cleanup_task] if self.cleanup_task else [])
        await asyncio.gather(*tasks, return_exceptions=True)
        for runtime in self.runtimes.values():
            if runtime.stream:
                await runtime.stream.close()
