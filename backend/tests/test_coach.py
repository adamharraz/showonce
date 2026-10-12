"""Live relay integration with a test-only SDK bridge; no real model requests."""
import asyncio
import base64
import io
import pytest
from PIL import Image
from google.genai import types
from fastapi.testclient import TestClient
from app.ai import AIError
from app.config import LIVE_MODEL, Settings
from app.coach import LiveBridge
from app.main import create_app
from tests.test_app import FakeAI, login
from app.models import LessonDraft, Step, Criterion

class TestBridge:
    __test__ = False
    instances = []
    def __init__(self, ai, instruction):
        self.instruction = instruction
        self.queue = asyncio.Queue()
        self.sent = []
        self.closed = False
        self.instances.append(self)
    async def open(self, handle=None):
        self.handle = handle
    async def send(self, kind, value):
        self.sent.append((kind, value))
        if kind == 'text':
            await self.queue.put(types.LiveServerMessage(server_content=types.LiveServerContent(
                output_transcription=types.Transcription(text='Test-only live reply.'),
                model_turn=types.Content(role='model', parts=[types.Part.from_bytes(data=b'\x00\x00'*100, mime_type='audio/pcm;rate=24000')]),
                turn_complete=True), usage_metadata=types.UsageMetadata(prompt_token_count=80,response_token_count=20)))
    async def receive(self):
        while True:
            item = await self.queue.get()
            if isinstance(item, Exception): raise item
            yield item
    async def close(self): self.closed = True

@pytest.fixture
def coach_client(tmp_path):
    TestBridge.instances = []
    settings = Settings(data_dir=tmp_path, gemini_key='', free_tier_confirmed=True, interval=3600, storage_mode='local', allow_local_login=True)
    app = create_app(settings, FakeAI(), TestBridge)
    with TestClient(app) as client:
        client.app = app
        yield client

def authenticate(ws, token, **values):
    ws.send_json({'type':'authenticate','token':token,'consent':True,'source':'camera',**values})
    assert ws.receive_json()['type'] == 'status'
    message = ws.receive_json()
    assert message['type'] == 'ready' and message['model'] == LIVE_MODEL
    return message

def until(ws, type):
    messages=[]
    for _ in range(12):
        message=ws.receive_json(); messages.append(message)
        if message['type']==type: return messages
    raise AssertionError(type)

def image():
    output=io.BytesIO(); Image.new('RGB',(320,240),'blue').save(output,format='JPEG')
    return base64.b64encode(output.getvalue()).decode()

def test_live_camera_voice_transcript_pause_and_history(coach_client):
    headers,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        ws.send_json({'type':'frame','data':image()})
        assert ws.receive_json()['type']=='frame_seen'
        ws.send_json({'type':'audio','data':base64.b64encode(b'\x00\x00'*640).decode()})
        ws.send_json({'type':'text','text':'What is visible?'})
        messages=until(ws,'turn_complete')
        assert any(m['type']=='audio' and m['sample_rate']==24000 for m in messages)
        assert any(m['type']=='transcript' and m['role']=='assistant' for m in messages)
        assert {kind for kind,_ in TestBridge.instances[0].sent}=={'frame','audio','text'}
        ws.send_json({'type':'microphone','enabled':False})
        ws.send_json({'type':'ping'})
        assert ws.receive_json()['type']=='pong'
        assert TestBridge.instances[0].sent[-1][0]=='audio_end'
        ws.send_json({'type':'control','action':'pause'})
        until(ws,'status')
        assert TestBridge.instances[0].closed
        ws.send_json({'type':'frame','data':image()})
        ws.send_json({'type':'ping'})
        assert ws.receive_json()['type']=='pong'
        ws.send_json({'type':'control','action':'resume'})
        until(ws,'ready')
        assert len(TestBridge.instances)==2
        ws.send_json({'type':'control','action':'finish'})
        until(ws,'finished')
    history=coach_client.get('/api/coaching/sessions',headers=headers).json()
    assert history[0]['state']=='finished'
    assert history[0]['messages'][-1]['text']=='Test-only live reply.'
    assert coach_client.portal.call(coach_client.app.state.store.all,'frame')==[]
    other,_=login(coach_client,'student')
    assert coach_client.get('/api/coaching/sessions',headers=other).json()==[]

@pytest.mark.parametrize('change',[{'consent':False},{'token':'bad-token'},{'model':'gemini-2.5-pro'}])
def test_invalid_auth_consent_and_model_override_never_open_bridge(coach_client,change):
    _,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        ws.send_json({'type':'authenticate','token':token,'consent':True,'source':'camera',**change})
        assert ws.receive_json()['type']=='error'
    assert TestBridge.instances==[]

def test_coach_excludes_other_ai_sessions(coach_client):
    headers,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        response=coach_client.post('/api/sessions',headers=headers,json={'mode':'teach','source':'camera'})
        assert response.status_code==409
        with pytest.raises(AIError) as error:
            coach_client.portal.call(coach_client.app.state.service.reserve_call)
        assert error.value.code=='session_active'
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')

def test_approved_lesson_context_and_explicit_step_selection(coach_client):
    _,token=login(coach_client)
    first=Step(title='Place object',instruction='Place the object.',expected_outcome='Object is visible.',criteria=[Criterion(description='Hidden continuity needs human confirmation.',mode='manual')])
    second=Step(title='Move object',instruction='Move the object.',expected_outcome='Object has moved.')
    draft=LessonDraft(title='Approved test lesson',steps=[first,second])
    coach_client.portal.call(coach_client.app.state.store.put,'version',{'id':'approved-coach-v1','owner_id':'local-instructor','draft':draft.model_dump()})
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token,lesson_id='approved-coach',version=1)
        assert 'Hidden continuity needs human confirmation.' in TestBridge.instances[0].instruction
        ws.send_json({'type':'step','step_id':second.id})
        until(ws,'turn_complete')
        assert coach_client.app.state.coach.active.record['step_id']==second.id
        assert 'learner explicitly selected' in TestBridge.instances[0].sent[-1][1]
        assert coach_client.portal.call(coach_client.app.state.store.all,'assessment')==[]
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')

def test_bad_audio_stops_live_session_and_preserves_conversation(coach_client):
    _,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        ws.send_json({'type':'audio','data':base64.b64encode(b'odd').decode()})
        messages=until(ws,'error')
        assert messages[-1]['code']=='invalid_input'
    assert TestBridge.instances[0].closed

def test_live_quota_error_blocks_further_calls(coach_client):
    _,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        coach_client.portal.call(TestBridge.instances[0].queue.put,AIError('Free quota exhausted.','quota'))
        assert until(ws,'error')[-1]['code']=='quota'
    async def reserve(): await coach_client.app.state.service.reserve_call()
    with pytest.raises(AIError) as error: coach_client.portal.call(reserve)
    assert error.value.code=='quota'

def test_disconnect_cancels_upstream_bridge(coach_client):
    _,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
    assert TestBridge.instances[0].closed
    assert coach_client.app.state.coach.active is None

def test_only_one_live_reconnect_is_attempted(coach_client):
    _,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        coach_client.app.state.coach.active.handle='saved-resumption-handle'
        coach_client.portal.call(TestBridge.instances[0].queue.put,AIError('Connection closed.','connection'))
        until(ws,'ready')
        assert TestBridge.instances[0].closed
        assert TestBridge.instances[1].handle=='saved-resumption-handle'
        coach_client.portal.call(TestBridge.instances[1].queue.put,AIError('Connection closed again.','connection'))
        until(ws,'error')
    assert len(TestBridge.instances)==2
    assert TestBridge.instances[1].closed

def test_large_live_usage_is_reported_without_ending_session(coach_client):
    headers,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        for count in (120000,90000):
            reply=types.LiveServerMessage(server_content=types.LiveServerContent(
                output_transcription=types.Transcription(text='Test-only large context reply.'),turn_complete=True),
                usage_metadata=types.UsageMetadata(prompt_token_count=count,response_token_count=20))
            coach_client.portal.call(TestBridge.instances[0].queue.put,reply)
            until(ws,'turn_complete')
        assert coach_client.app.state.coach.active.record['charged_tokens']==210040
        ws.send_json({'type':'control','action':'pause'}); until(ws,'status')
        ws.send_json({'type':'control','action':'resume'}); until(ws,'ready')
        ws.send_json({'type':'ping'}); assert ws.receive_json()['type']=='pong'
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')
    record=coach_client.get('/api/coaching/sessions',headers=headers).json()[0]
    assert record['state']=='finished' and record['charged_tokens']==210040
    coach_client.portal.call(coach_client.app.state.service.reserve_call)

def test_finish_preserves_partial_reply_and_known_usage(coach_client):
    headers,token=login(coach_client)
    with coach_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        partial=types.LiveServerMessage(server_content=types.LiveServerContent(output_transcription=types.Transcription(text='Test-only partial reply.')),
            usage_metadata=types.UsageMetadata(prompt_token_count=80,response_token_count=20))
        coach_client.portal.call(TestBridge.instances[0].queue.put,partial)
        assert until(ws,'speaking')[-1]['turns']==1
        until(ws,'transcript')
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')
    history=coach_client.get('/api/coaching/sessions',headers=headers).json()
    assert history[0]['turns']==1 and history[0]['charged_tokens']==100
    metrics=coach_client.portal.call(coach_client.app.state.store.all,'metric')
    assert len(metrics)==1 and metrics[0]['usage_available'] and not metrics[0]['completed']

@pytest.mark.asyncio
async def test_installed_sdk_gets_fixed_live_model_and_bounded_config(tmp_path):
    class Context:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
    class Live:
        def connect(self,*,model,config):
            assert model==LIVE_MODEL
            assert config.response_modalities==['AUDIO']
            assert config.input_audio_transcription and config.output_audio_transcription
            assert config.context_window_compression.sliding_window.target_tokens==8000
            assert config.session_resumption.handle=='resume-handle'
            return Context()
    class Client:
        class Aio: live=Live()
        aio=Aio()
    ai=FakeAI(); ai.client=Client()
    bridge=LiveBridge(ai,'Synthetic test instruction')
    await bridge.open('resume-handle'); await bridge.close()
