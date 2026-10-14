"""Application correctness tests. FakeAI is test-only, never a runtime fallback."""
import asyncio
import base64
import io
import time
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from app.config import MODEL, Settings
from app.main import create_app
from app.ai import Gemini, AIError, OBSERVER, WRITER
from app.models import LessonDraft, Step, Criterion, Question, Observation, ObservationBatch, AssessmentOutput, CriterionResult
from app.services import guard_assessment, publication_errors, validate_draft

class FakeAI:
    last_usage = {'test_fixture': True}
    actual_model = 'test-only'
    def ready(self):
        pass
    async def observe(self, ledger, frames, pcm):
        return ObservationBatch(task_title='Observed test activity', observations=[Observation(action='Move the visible object onto the table.', expected_outcome='Object rests on the table.', evidence_ids=[frames[-1]['id']], timestamp_ms=frames[-1]['timestamp_ms'])])
    async def finalize(self, ledger, frames, gaps):
        return LessonDraft(title='Test-generated lesson', materials=['Observed object'], steps=[Step(title='Place the object', instruction=ledger[0]['action'], expected_outcome='Object rests on the table.', evidence_ids=[frames[0]['id']], criteria=[Criterion(description='Object is on the table.', mode='visual')])], questions=[Question(text='Clarify the hidden setting.')])
    async def assess(self, step, references, student, physical):
        return AssessmentOutput(outcome='met', explanation='The object is visibly on the table.', evidence_ids=[student[-1]['id']], criteria=[CriterionResult(criterion_id=c['id'], supported=True, evidence_ids=[student[-1]['id']], explanation='Visible') for c in step['criteria'] if c['mode']=='visual'])

@pytest.fixture
def client(tmp_path):
    settings = Settings(data_dir=tmp_path, interval=3600, gemini_key='', storage_mode='local', origin='http://localhost:8000', allow_local_login=True)
    app = create_app(settings, FakeAI())
    with TestClient(app) as client:
        client.app = app
        yield client

def login(client, role='instructor'):
    token = client.post('/api/auth/local', json={'role':role}).json()['token']
    return {'Authorization':'Bearer '+token}, token

@pytest.mark.parametrize('source', ['camera', 'phone', 'screen'])
@pytest.mark.parametrize('mode', ['teach', 'practice'])
def test_all_capture_modes_report_flash_lite(client, source, mode):
    config = client.get('/api/config').json()
    assert config['physical_model'] == config['general_model'] == MODEL
    headers, _ = login(client, 'instructor' if mode == 'teach' else 'student')
    body = {'mode': mode, 'source': source}
    if mode == 'practice':
        draft = LessonDraft(title='Approved test lesson', steps=[Step(title='Place', instruction='Place the object.', expected_outcome='Object is visible.')])
        client.portal.call(client.app.state.store.put, 'version', {'id': 'model-policy-v1', 'owner_id': 'local-instructor', 'draft': draft.model_dump()})
        body.update(lesson_id='model-policy', version=1)
    response = client.post('/api/sessions', headers=headers, json=body)
    assert response.status_code == 201
    assert response.json()['model'] == MODEL

def frame_data():
    output = io.BytesIO()
    Image.new('RGB', (320,200), '#ad91dd').save(output,format='JPEG')
    return base64.b64encode(output.getvalue()).decode()

def wait_job(client, headers, id):
    for _ in range(50):
        state = client.get('/api/sessions/'+id, headers=headers).json()
        if (state.get('job') or {}).get('state') in ('complete','failed'):
            return state
        time.sleep(.02)
    raise AssertionError('Test finalization did not complete')

def complete_teaching(client):
    headers, token = login(client)
    session = client.post('/api/sessions', headers=headers, json={'mode':'teach','source':'camera'}).json()
    with client.websocket_connect('/api/sessions/'+session['id']+'/stream', headers={'origin':'http://localhost:8000'}) as ws:
        ws.send_json({'type':'authenticate','token':token})
        assert ws.receive_json()['type']=='status'
        ws.send_json({'type':'frame','id':'frame1','timestamp_ms':1000,'data':frame_data()})
        assert ws.receive_json()['type']=='frame_saved'
        ws.send_json({'type':'control','action':'finish'})
        for _ in range(10):
            msg=ws.receive_json()
            if msg['type']=='status' and msg['session']['state']=='finished':
                break
    state=wait_job(client,headers,session['id'])
    assert state['job']['state']=='complete', state
    lesson=client.get('/api/lessons/'+session['lesson_id']+'/draft',headers=headers).json()
    return headers, session, lesson

def publish_lesson(client):
    headers,session,lesson=complete_teaching(client)
    lesson['draft']['questions'][0]['answer']='Confirmed by instructor.'
    r=client.patch('/api/lessons/'+lesson['id']+'/draft',headers=headers,json={'revision':lesson['revision'],'draft':lesson['draft']})
    assert r.status_code==200,r.text
    saved=r.json()
    r=client.post('/api/lessons/'+lesson['id']+'/publish',headers=headers,json={'revision':saved['revision'],'reviewed':True})
    assert r.status_code==200,r.text
    return headers,session,saved,r.json()

def test_live_capture_to_review_blocks_unresolved_publication(client):
    headers,session,lesson=complete_teaching(client)
    r=client.post('/api/lessons/'+lesson['id']+'/publish',headers=headers,json={'revision':0,'reviewed':True})
    assert r.status_code==422
    assert 'Clarify the hidden setting' in r.text
    assert client.get('/api/sessions/'+session['id'],headers=headers).json()['observations'][0]['evidence_ids']

def test_published_version_is_immutable_and_export_has_evidence(client):
    headers,session,lesson,version=publish_lesson(client)
    lesson['draft']['title']='Changed draft'
    assert client.patch('/api/lessons/'+lesson['id']+'/draft',headers=headers,json={'revision':lesson['revision'],'draft':lesson['draft']}).status_code==200
    original=client.get(f"/api/lessons/{lesson['id']}/versions/1",headers=headers).json()
    assert original['draft']['title']=='Test-generated lesson'
    bundle=client.get(f"/api/lessons/{lesson['id']}/versions/1/export",headers=headers)
    import zipfile
    with zipfile.ZipFile(io.BytesIO(bundle.content)) as z:
        assert 'lesson.json' in z.namelist()
        assert any(p.startswith('screenshots/') for p in z.namelist())

def test_library_previews_use_published_evidence_for_students(client):
    headers, session, lesson, version = publish_lesson(client)
    draft = lesson['draft']
    draft['steps'][0]['evidence_ids'] = []
    draft['steps'][0]['provenance'] = 'instructor-confirmed'
    draft['steps'][0]['criteria'][0]['mode'] = 'manual'
    draft['questions'][0]['answer'] = ''
    assert client.patch('/api/lessons/'+lesson['id']+'/draft', headers=headers, json={'revision':lesson['revision'], 'draft':draft}).status_code == 200
    owner = client.get('/api/lessons', headers=headers).json()[0]
    assert owner['evidence_ids'] == []
    assert owner['unresolved_count'] == 1
    student_headers, _ = login(client, 'student')
    student = client.get('/api/lessons', headers=student_headers).json()[0]
    assert student['evidence_ids'] == version['draft']['steps'][0]['evidence_ids']
    assert student['source'] == 'camera'
    assert student['unresolved_count'] == 0
    assert client.get('/api/frames/'+student['evidence_ids'][0], headers=student_headers).status_code == 200

def test_student_cannot_access_private_drafts_or_create_teacher_session(client):
    headers,session,lesson=complete_teaching(client)
    student,_=login(client,'student')
    assert client.get('/api/lessons/'+lesson['id']+'/draft',headers=student).status_code==403
    assert client.get('/api/sessions/'+session['id'],headers=student).status_code==403
    assert client.post('/api/sessions',headers=student,json={'mode':'teach','source':'camera'}).status_code==403
    fid=lesson['draft']['steps'][0]['evidence_ids'][0]
    assert client.get('/api/frames/'+fid,headers=student).status_code==403

def test_student_can_practice_published_version_and_references(client):
    headers,session,lesson,version=publish_lesson(client)
    student,token=login(client,'student')
    fid=version['draft']['steps'][0]['evidence_ids'][0]
    assert client.get('/api/frames/'+fid,headers=student).status_code==200
    r=client.post('/api/sessions',headers=student,json={'mode':'practice','source':'camera','lesson_id':lesson['id'],'version':1})
    assert r.status_code==201,r.text
    practice=r.json()
    with client.websocket_connect('/api/sessions/'+practice['id']+'/stream',headers={'origin':'http://localhost:8000'}) as ws:
        ws.send_json({'type':'authenticate','token':token});ws.receive_json()
        ws.send_json({'type':'frame','id':'student1','timestamp_ms':1000,'data':frame_data()});ws.receive_json()
        ws.send_json({'type':'control','action':'finish'})
        for _ in range(10):
            message=ws.receive_json()
            if message['type']=='assessment':
                assert message['assessment']['outcome']=='met'
                assert message['assessment']['step_id']==practice['step_id']
            if message['type']=='status' and message['session']['state']=='finished':
                break
    result=client.get('/api/sessions/'+practice['id'],headers=student).json()
    assert len(result['assessments'])==1

def test_one_active_session_and_draft_conflict(client):
    headers,_=login(client)
    assert client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'camera'}).status_code==201
    assert client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'camera'}).status_code==409

def test_capture_ticket_is_single_use_and_cannot_control(client):
    headers,_=login(client)
    session=client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'phone'}).json()
    ticket=client.post('/api/sessions/'+session['id']+'/capture-ticket',headers=headers).json()['ticket']
    url='/api/sessions/'+session['id']+'/stream'
    with client.websocket_connect(url,headers={'origin':'http://localhost:8000'}) as ws:
        ws.send_json({'type':'authenticate','ticket':ticket})
        assert ws.receive_json()['type']=='paired'
        ws.send_json({'type':'control','action':'finish'})
        assert ws.receive_json()['type']=='error'
    with client.websocket_connect(url,headers={'origin':'http://localhost:8000'}) as ws:
        ws.send_json({'type':'authenticate','ticket':ticket})
        assert ws.receive_json()['type']=='error'

def test_foreign_evidence_rejected(client):
    headers,session,lesson=complete_teaching(client)
    lesson['draft']['steps'][0]['evidence_ids']=['another-users-frame']
    r=client.patch('/api/lessons/'+lesson['id']+'/draft',headers=headers,json={'revision':0,'draft':lesson['draft']})
    assert r.status_code==422

def test_false_pass_and_manual_criteria_are_not_accepted():
    step=Step(title='Step',instruction='Place object',expected_outcome='Object visible',criteria=[Criterion(id='visual',description='Visible object',mode='visual'),Criterion(id='manual',description='Hidden continuity',mode='manual')]).model_dump()
    result=guard_assessment(step,AssessmentOutput(outcome='met',explanation='Looks good',criteria=[]),['f'])
    assert result.outcome=='clearer_view'
    with pytest.raises(ValueError):
        guard_assessment(step,AssessmentOutput(outcome='met',explanation='Looks good',criteria=[CriterionResult(criterion_id='manual',supported=True,evidence_ids=['f'],explanation='Guess')]),['f'])

def test_model_prompts_have_no_hidden_esp32_checklist():
    for prompt in (OBSERVER,WRITER):
        assert 'GPIO23' not in prompt
        assert 'ESP32' not in prompt
        assert 'resistor' not in prompt

def test_api_key_does_not_bypass_free_tier_guard(tmp_path):
    ai=Gemini(Settings(data_dir=tmp_path,gemini_key='offline-inspection-only',free_tier_confirmed=False))
    with pytest.raises(AIError) as error:
        ai.ready()
    assert error.value.code=='budget_guard'

def test_restart_preserves_ledger_and_requires_job_retry(tmp_path):
    settings=Settings(data_dir=tmp_path,interval=3600,gemini_key='',storage_mode='local',allow_local_login=True)
    app=create_app(settings,FakeAI())
    with TestClient(app) as c:
        h,_=login(c)
        s=c.post('/api/sessions',headers=h,json={'mode':'teach','source':'camera'}).json()
        c.portal.call(app.state.store.put,'job',{'id':'job-'+s['id'],'owner_id':'local-instructor','session_id':s['id'],'state':'running','attempts':1,'error':None})
    app2=create_app(settings,FakeAI())
    with TestClient(app2) as c:
        h,_=login(c)
        r=c.get('/api/sessions/'+s['id'],headers=h).json()
        assert r['session']['state']=='interrupted'
        assert r['job']['state']=='interrupted'
        assert r['session']['gaps']

def test_quota_blocks_resume_finalization_and_further_calls(client):
    headers,token=login(client)
    session=client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'camera'}).json()
    calls=[]
    async def quota(*args):
        calls.append(1)
        raise AIError('Free quota exhausted.', 'quota')
    client.app.state.service.ai.observe=quota
    with client.websocket_connect('/api/sessions/'+session['id']+'/stream',headers={'origin':'http://localhost:8000'}) as ws:
        ws.send_json({'type':'authenticate','token':token});ws.receive_json()
        ws.send_json({'type':'frame','id':'quota-frame','timestamp_ms':1000,'data':frame_data()});ws.receive_json()
        client.portal.call(client.app.state.service.runtimes[session['id']].analyze)
        state=client.get('/api/sessions/'+session['id'],headers=headers).json()
        assert state['session']['state']=='quota_paused'
        ws.send_json({'type':'control','action':'resume'})
        while ws.receive_json()['type']!='error': pass
    state=client.get('/api/sessions/'+session['id'],headers=headers).json()
    assert state['session']['state']=='quota_paused'
    assert client.post('/api/sessions/'+session['id']+'/finalize',headers=headers).status_code==409
    assert calls==[1]
    another=client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'camera'}).json()
    next_runtime=client.app.state.service.runtimes[another['id']]
    from app.models import FrameMessage
    client.portal.call(next_runtime.frame,FrameMessage(type='frame',id='next',timestamp_ms=1000,data=frame_data()))
    client.portal.call(next_runtime.analyze)
    assert next_runtime.session['state']=='quota_paused'
    assert calls==[1], 'A new session must not bypass the shared quota guard'

def test_invalid_model_evidence_does_not_change_ledger(client):
    headers,_=login(client)
    s=client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'camera'}).json()
    runtime=client.app.state.service.runtimes[s['id']]
    from app.models import FrameMessage
    client.portal.call(runtime.frame,FrameMessage(type='frame',id='real',timestamp_ms=1000,data=frame_data()))
    async def invalid(*args):
        return ObservationBatch(observations=[Observation(action='Invented action',evidence_ids=['foreign-frame'],timestamp_ms=1000)])
    client.app.state.service.ai.observe=invalid
    client.portal.call(runtime.analyze)
    state=client.get('/api/sessions/'+s['id'],headers=headers).json()
    assert state['observations']==[]
    assert state['session']['last_error']['code']=='invalid_output'
    assert len(runtime.frames)==1

def test_conflicting_edits_and_wrong_version_step_are_rejected(client):
    headers,s,lesson,version=publish_lesson(client)
    assert client.patch('/api/lessons/'+lesson['id']+'/draft',headers=headers,json={'revision':0,'draft':lesson['draft']}).status_code==409
    p=client.post('/api/sessions',headers=headers,json={'mode':'practice','source':'camera','lesson_id':lesson['id'],'version':1}).json()
    assert client.post('/api/sessions/'+p['id']+'/step',headers=headers,json={'step_id':'foreign-step'}).status_code==422

def test_evidence_export_is_owner_only_and_contains_no_audio(client):
    headers,s,lesson=complete_teaching(client)
    student,_=login(client,'student')
    url='/api/sessions/'+s['id']+'/evidence/export'
    assert client.get(url,headers=student).status_code==403
    import zipfile,json
    with zipfile.ZipFile(io.BytesIO(client.get(url,headers=headers).content)) as z:
        manifest=json.loads(z.read('evidence.json'))
        assert manifest['audio_retained'] is False
        assert manifest['observations']
        assert not any(name.endswith('.wav') for name in z.namelist())

@pytest.mark.asyncio
async def test_step_change_discards_inflight_assessment(tmp_path):
    from app.storage import Store
    from app.services import Service,Runtime,now
    from app.models import FrameMessage
    started=asyncio.Event();release=asyncio.Event()
    class Delayed(FakeAI):
        async def assess(self,*args):
            started.set();await release.wait()
            return await super().assess(*args)
    settings=Settings(data_dir=tmp_path,interval=3600,gemini_key='',storage_mode='local')
    store=Store(settings);service=Service(settings,store,Delayed())
    step=Step(title='First',instruction='Place object',expected_outcome='Object visible',criteria=[Criterion(description='Visible object',mode='visual')])
    session={'id':'practice','owner_id':'local-student','mode':'practice','source':'camera','state':'capturing','created_at':now(),'step_id':step.id,'version_id':'lesson-v1','gaps':[],'last_error':None}
    await store.put('version',{'id':'lesson-v1','owner_id':'local-instructor','draft':LessonDraft(title='Test',steps=[step]).model_dump()})
    runtime=Runtime(session,service);service.runtimes[session['id']]=runtime
    try:
        await runtime.frame(FrameMessage(type='frame',id='student',timestamp_ms=1000,data=frame_data()))
        task=asyncio.create_task(runtime.analyze());await started.wait()
        # Returning to the same step must still reject an earlier attempt.
        runtime.session['step_revision']=2;release.set();await task
        assert await store.all('assessment')==[]
        assert runtime.frames==[]
    finally:
        await service.close();await store.close()

def test_second_phone_cannot_detach_existing_capture(client):
    headers,_=login(client)
    s=client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'phone'}).json()
    url='/api/sessions/'+s['id']+'/stream'
    ticket=lambda:client.post('/api/sessions/'+s['id']+'/capture-ticket',headers=headers).json()['ticket']
    first=ticket()
    with client.websocket_connect(url,headers={'origin':'http://localhost:8000'}) as phone:
        phone.send_json({'type':'authenticate','ticket':first});assert phone.receive_json()['type']=='paired'
        with client.websocket_connect(url,headers={'origin':'http://localhost:8000'}) as second:
            second.send_json({'type':'authenticate','ticket':ticket()});assert second.receive_json()['type']=='error'
        phone.send_json({'type':'ping'});assert phone.receive_json()['state']=='capturing'
        assert client.app.state.service.runtimes[s['id']].producer is not None

def test_ai_revision_preserves_unresolved_questions(client):
    headers,s,lesson=complete_teaching(client)
    async def revise(draft,frames):
        result=LessonDraft.model_validate(draft)
        result.questions=[]
        result.steps[0].instruction='Revised instruction based on review.'
        return result
    client.app.state.service.ai.revise=revise
    r=client.post('/api/lessons/'+lesson['id']+'/revise',headers=headers,json={'revision':0})
    assert r.status_code==200,r.text
    result=r.json()
    assert result['revision']==1
    assert result['draft']['questions'][0]['required'] is True
    assert client.post('/api/lessons/'+lesson['id']+'/publish',headers=headers,json={'revision':1,'reviewed':True}).status_code==422

def test_elapsed_session_rejects_new_frames(client):
    from datetime import datetime,timezone,timedelta
    from app.models import FrameMessage
    headers,_=login(client)
    s=client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'camera'}).json()
    runtime=client.app.state.service.runtimes[s['id']]
    runtime.session['created_at']=(datetime.now(timezone.utc)-timedelta(minutes=6)).isoformat()
    client.portal.call(runtime.frame,FrameMessage(type='frame',id='late',timestamp_ms=300000,data=frame_data()))
    assert runtime.stopped
    assert client.portal.call(client.app.state.store.get,'frame',s['id']+'-late') is None


@pytest.mark.asyncio
async def test_finish_stops_capture_and_freezes_time_before_inflight_analysis(tmp_path):
    from app.storage import Store
    from app.services import Service, Runtime, now
    from app.models import FrameMessage
    from datetime import datetime, timezone, timedelta
    started = asyncio.Event(); release = asyncio.Event(); capture_ended = asyncio.Event()
    class Delayed(FakeAI):
        async def observe(self, *args):
            started.set()
            await release.wait()
            return await super().observe(*args)
    class Phone:
        async def send_json(self, message):
            if message.get('state') == 'finishing':
                capture_ended.set()
    settings = Settings(data_dir=tmp_path, interval=3600, gemini_key='', storage_mode='local')
    store = Store(settings); service = Service(settings, store, Delayed())
    session = {'id': 'delayed', 'owner_id': 'local-instructor', 'lesson_id': 'delayed-lesson', 'mode': 'teach', 'source': 'phone', 'state': 'capturing', 'created_at': (datetime.now(timezone.utc)-timedelta(seconds=60)).isoformat(), 'model': MODEL, 'gaps': [], 'last_error': None}
    runtime = Runtime(session, service); service.runtimes[session['id']] = runtime
    runtime.producer = Phone()
    analysis = finish = None
    try:
        await runtime.frame(FrameMessage(type='frame', id='before', timestamp_ms=1000, data=frame_data()))
        analysis = asyncio.create_task(runtime.analyze())
        await asyncio.wait_for(started.wait(), 1)
        finish = asyncio.create_task(runtime.finish())
        await asyncio.wait_for(capture_ended.wait(), 1)
        saved = await store.get('session', session['id'])
        assert saved['state'] == 'finishing'
        assert saved['finished_at']
        duration = runtime.elapsed_ms
        await asyncio.sleep(.02)
        assert runtime.elapsed_ms == duration, 'AI latency must not extend the recording'
        await runtime.frame(FrameMessage(type='frame', id='after', timestamp_ms=2000, data=frame_data()))
        assert await store.get('frame', 'delayed-after') is None
        assert not finish.done(), 'The final evidence is still being analyzed'
        release.set(); await analysis; await finish
        assert runtime.session['state'] == 'finished'
        assert runtime.session['finished_at'] == saved['finished_at']
        await runtime.finish()
        assert runtime.session['finished_at'] == saved['finished_at']
        await asyncio.gather(*list(service.jobs))
        assert (await store.get('job', 'job-delayed'))['state'] == 'complete'
    finally:
        release.set()
        await asyncio.gather(*(task for task in (analysis, finish) if task), return_exceptions=True)
        await service.close(); await store.close()


def test_finish_and_finalization_retry_preserve_recording_end(client):
    headers, session, _ = complete_teaching(client)
    saved = client.get('/api/sessions/'+session['id'], headers=headers).json()['session']['finished_at']
    time.sleep(.01)
    assert client.post('/api/sessions/'+session['id']+'/finish', headers=headers).json()['finished_at'] == saved
    assert client.post('/api/sessions/'+session['id']+'/finalize', headers=headers).status_code == 202
    assert client.get('/api/sessions/'+session['id'], headers=headers).json()['session']['finished_at'] == saved


def test_busy_session_with_no_ledger_can_retry_saved_evidence(client):
    from app.models import FrameMessage
    headers, _ = login(client)
    session = client.post('/api/sessions', headers=headers, json={'mode': 'teach', 'source': 'camera'}).json()
    runtime = client.app.state.service.runtimes[session['id']]
    async def busy(*args):
        raise AIError('Synthetic provider overload. Try again shortly.', 'model_busy')
    client.app.state.service.ai.observe = busy
    client.portal.call(runtime.frame, FrameMessage(type='frame', id='saved', timestamp_ms=1000, data=frame_data()))
    client.portal.call(runtime.finish)
    ended = runtime.session['finished_at']
    assert client.post('/api/sessions/'+session['id']+'/finalize', headers=headers).status_code == 202
    failed = wait_job(client, headers, session['id'])
    assert failed['job']['state'] == 'failed'
    assert failed['observations'] == []
    assert not client.portal.call(client.app.state.store.get, 'frame', session['id']+'-saved')['processed']
    client.app.state.service.ai.observe = FakeAI().observe
    assert client.post('/api/sessions/'+session['id']+'/finalize', headers=headers).status_code == 202
    recovered = wait_job(client, headers, session['id'])
    assert recovered['job']['state'] == 'complete'
    assert recovered['job']['attempts'] == 2
    assert recovered['observations'][0]['evidence_ids'] == [session['id']+'-saved']
    assert recovered['session']['finished_at'] == ended
    lesson = client.get('/api/lessons/'+session['lesson_id']+'/draft', headers=headers).json()
    assert lesson['draft']['steps']
    assert any(q['required'] and 'gaps' in q['text'] for q in lesson['draft']['questions'])


def test_partial_recovery_retries_only_unprocessed_windows(client):
    from app.models import FrameMessage
    headers, _ = login(client)
    session = client.post('/api/sessions', headers=headers, json={'mode': 'teach', 'source': 'camera'}).json()
    runtime = client.app.state.service.runtimes[session['id']]
    for index in range(12):
        runtime.last_frame = 0
        client.portal.call(runtime.frame, FrameMessage(type='frame', id=f'window-{index}', timestamp_ms=(index+1)*1000, data=frame_data()))
    # Simulate a restored, finished session with screenshots but no ledger/audio.
    runtime.stopped = True
    runtime.session.update(state='finished', finished_at=runtime.session['created_at'])
    client.portal.call(runtime.save)
    original = FakeAI().observe
    windows = []
    async def intermittent(ledger, frames, pcm):
        windows.append([f['id'] for f in frames])
        assert pcm == b''
        if len(windows) == 2:
            raise AIError('Synthetic overload in the second window.', 'model_busy')
        return await original(ledger, frames, pcm)
    client.app.state.service.ai.observe = intermittent
    assert client.post('/api/sessions/'+session['id']+'/finalize', headers=headers).status_code == 202
    assert wait_job(client, headers, session['id'])['job']['state'] == 'failed'
    assert list(map(len, windows)) == [10, 2]
    assert client.post('/api/sessions/'+session['id']+'/finalize', headers=headers).status_code == 202
    state = wait_job(client, headers, session['id'])
    assert state['job']['state'] == 'complete'
    assert windows[2] == windows[1], 'Already processed screenshots must not be sent again'
    assert len(state['observations']) == 2

def test_retention_keeps_published_references_only(client):
    from datetime import datetime,timezone,timedelta
    headers,s,lesson,version=publish_lesson(client)
    store=client.app.state.store
    reference=client.portal.call(store.get,'frame',version['draft']['steps'][0]['evidence_ids'][0])
    old=(datetime.now(timezone.utc)-timedelta(days=8)).isoformat()
    client.portal.call(store.put,'session',{'id':'expired-practice','owner_id':'local-student','mode':'practice'})
    for id,session_id,date in [('unused-teaching',s['id'],reference['created_at']),('old-practice','expired-practice',old)]:
        value={**reference,'id':id,'session_id':session_id,'created_at':date,'key':session_id+'/'+id+'.jpg'}
        client.portal.call(store.put_blob,value['key'],base64.b64decode(frame_data()))
        client.portal.call(store.put,'frame',value)
    client.portal.call(client.app.state.service.cleanup)
    assert client.portal.call(store.get,'frame',reference['id']) is not None
    assert client.portal.call(store.get,'frame','unused-teaching') is None
    assert client.portal.call(store.get,'frame','old-practice') is None
