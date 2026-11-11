"""Regression cases found by the main-branch review; no real model calls."""
import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import User
from app.config import Settings
from app.main import create_app
from app.models import CreateSession, FrameMessage, LessonDraft, Question, SetStep, Step
from tests.test_app import FakeAI, frame_data, login, wait_job


@pytest.mark.parametrize('steps_full', [False, True])
def test_capture_gap_never_saves_an_unreadable_full_question_draft(tmp_path, steps_full):
    class FullQuestionsAI(FakeAI):
        async def finalize(self, ledger, frames, gaps):
            result = await super().finalize(ledger, frames, gaps)
            result.questions = [Question(text=f'Clarification {index}') for index in range(15)]
            if steps_full:
                result.steps[0].questions = [Question(text=f'Step clarification {index}') for index in range(8)]
            return result

    settings = Settings(data_dir=tmp_path, interval=3600, gemini_key='', storage_mode='local', allow_local_login=True, demo_mode=False)
    app = create_app(settings, FullQuestionsAI())
    with TestClient(app, raise_server_exceptions=False) as client:
        client.app = app
        headers, _ = login(client)
        session = client.post('/api/sessions', headers=headers, json={'mode': 'teach', 'source': 'camera'}).json()
        runtime = app.state.service.runtimes[session['id']]
        client.portal.call(runtime.frame, FrameMessage(type='frame', id='evidence', timestamp_ms=1000, data=frame_data()))
        runtime.session['gaps'].append({'timestamp_ms': 1000, 'reason': 'Missing narration'})
        assert client.post('/api/sessions/' + session['id'] + '/finalize', headers=headers).status_code == 202
        state = wait_job(client, headers, session['id'])
        lesson = client.portal.call(app.state.store.get, 'lesson', session['lesson_id'])
        if steps_full:
            assert state['job']['state'] == 'failed'
            assert 'clarification' in state['job']['error'].lower()
            assert lesson is None
            assert client.portal.call(app.state.store.get, 'frame', session['id'] + '-evidence')
        else:
            assert state['job']['state'] == 'complete', state
            response = client.get('/api/lessons/' + session['lesson_id'] + '/draft', headers=headers)
            assert response.status_code == 200, response.text
            draft = response.json()['draft']
            all_questions = draft['questions'] + [q for step in draft['steps'] for q in step['questions']]
            assert {q['text'] for q in all_questions} >= {f'Clarification {index}' for index in range(15)}
            assert any(q['required'] and 'capture has gaps' in q['text'].lower() for q in all_questions)
            assert client.post('/api/lessons/' + session['lesson_id'] + '/publish', headers=headers,
                               json={'revision': 0, 'reviewed': True}).status_code == 422


@pytest.mark.asyncio
async def test_waiting_step_change_cannot_resurrect_a_finished_practice_session(tmp_path, monkeypatch):
    app = create_app(Settings(data_dir=tmp_path, interval=3600, gemini_key='', storage_mode='local', allow_local_login=True, demo_mode=False), FakeAI())
    store, service = app.state.store, app.state.service
    endpoints = {route.name: route.endpoint for route in app.routes if hasattr(route, 'endpoint')}
    draft = LessonDraft(title='Practice', steps=[Step(id=name, title=name, instruction='Place object', expected_outcome='Object placed', provenance='instructor-confirmed') for name in ('first', 'second')])
    await store.put('version', {'id': 'lesson-v1', 'lesson_id': 'lesson', 'owner_id': 'local-instructor', 'version': 1, 'draft': draft.model_dump()})
    student = User('local-student', 'student')
    session = await endpoints['create_session'](CreateSession(mode='practice', source='camera', lesson_id='lesson', version=1), student)
    runtime = service.runtimes[session['id']]
    snapshot_read = asyncio.Event()
    original_get = store.get

    async def tracked_get(kind, id):
        result = await original_get(kind, id)
        if kind == 'session' and id == session['id']:
            snapshot_read.set()
        return result

    monkeypatch.setattr(store, 'get', tracked_get)
    await runtime.storage_lock.acquire()
    task = asyncio.create_task(endpoints['set_step'](session['id'], SetStep(step_id='second'), student))
    try:
        await asyncio.wait_for(snapshot_read.wait(), 2)
        # A timeout or WebSocket Finish can finish while the step waits for a frame write.
        await asyncio.wait_for(runtime.finish(), 2)
        runtime.storage_lock.release()
        with pytest.raises(HTTPException) as caught:
            await asyncio.wait_for(task, 2)
        assert caught.value.status_code == 409
        saved = await store.get('session', session['id'])
        assert saved['state'] == 'finished' and saved['finished_at']
        assert saved['step_id'] == 'first'
    finally:
        if runtime.storage_lock.locked():
            runtime.storage_lock.release()
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await service.close()
        await store.close()


@pytest.mark.asyncio
async def test_finish_serializes_with_step_selection_after_a_server_restart(tmp_path, monkeypatch):
    app = create_app(Settings(data_dir=tmp_path, interval=3600, gemini_key='', storage_mode='local', allow_local_login=True, demo_mode=False), FakeAI())
    store, service = app.state.store, app.state.service
    endpoints = {route.name: route.endpoint for route in app.routes if hasattr(route, 'endpoint')}
    draft = LessonDraft(title='Practice', steps=[Step(id=name, title=name, instruction='Place object', expected_outcome='Placed', provenance='instructor-confirmed') for name in ('first', 'second')])
    await store.put('version', {'id': 'lesson-v1', 'lesson_id': 'lesson', 'owner_id': 'local-instructor', 'version': 1, 'draft': draft.model_dump()})
    student = User('local-student', 'student')
    session = await endpoints['create_session'](CreateSession(mode='practice', source='camera', lesson_id='lesson', version=1), student)
    runtime = service.runtimes.pop(session['id'])
    runtime.task.cancel()
    await asyncio.gather(runtime.task, return_exceptions=True)
    session['state'] = 'interrupted'
    await store.put('session', session)
    read, release = asyncio.Event(), asyncio.Event()
    original_get = store.get

    async def delayed_version(kind, id):
        result = await original_get(kind, id)
        if kind == 'version':
            read.set()
            await release.wait()
        return result

    monkeypatch.setattr(store, 'get', delayed_version)
    step = asyncio.create_task(endpoints['set_step'](session['id'], SetStep(step_id='second'), student))
    finish = None
    try:
        await asyncio.wait_for(read.wait(), 2)
        finish = asyncio.create_task(endpoints['finish_session'](session['id'], student))
        # Finish cannot acknowledge completion while the earlier step still owns
        # an outdated snapshot that could subsequently overwrite it.
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(asyncio.shield(finish), 0.1)
        release.set()
        await asyncio.wait_for(asyncio.gather(step, finish), 2)
        saved = await store.get('session', session['id'])
        assert saved['state'] == 'finished' and saved['finished_at']
    finally:
        release.set()
        await asyncio.gather(step, *([finish] if finish else []), return_exceptions=True)
        await service.close()
        await store.close()
