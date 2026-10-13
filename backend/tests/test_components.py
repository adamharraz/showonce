"""Synthetic transport and trust-boundary tests, not component accuracy claims."""
import pytest
from fastapi.testclient import TestClient
from google.genai import types
from pydantic import ValidationError
from app.components import ComponentScene, InspectionOutput, ScenePart, PartEdit, edit_part
from app.config import Settings
from app.main import create_app
from app.coach import LiveBridge
from tests.test_app import FakeAI, login
from tests.test_coach import TestBridge, authenticate, until, image

class ComponentBridge(TestBridge):
    """Explicit fixture result; no production endpoint imports this class."""
    async def send(self, kind, value):
        if kind == 'inspect':
            text = value['text']
            self.sent.append((kind, {'text':text, 'has_image':bool(value['image'])}))
            frame_id = text.split('frame_id ')[1].split('.')[0]
            await self.queue.put(types.LiveServerMessage(tool_call=types.LiveServerToolCall(function_calls=[types.FunctionCall(
                id='test-inspection', name='show_components', args={
                    'frame_id':frame_id, 'components':[
                        {'id':'board1','part_id':'esp32','evidence':'Test-only synthetic board result; exact board not established.','uncertain':True},
                        {'id':'resistor1','part_id':'resistor','evidence':'Test-only synthetic axial body result; bands unreadable.','uncertain':False}],
                    'questions':['Which exact board variant is present?','What is the unreadable resistor value?']})])))
            await super().send('text',text)
        else:
            await super().send(kind,value)

@pytest.fixture
def component_client(tmp_path):
    ComponentBridge.instances=[]
    settings=Settings(data_dir=tmp_path, gemini_key='', free_tier_confirmed=True, storage_mode='local', allow_local_login=True)
    with TestClient(create_app(settings,FakeAI(),ComponentBridge)) as client:
        yield client

def open_and_inspect(client,ws,token):
    record=authenticate(ws,token)
    ws.send_json({'type':'frame','data':image()}); assert ws.receive_json()['type']=='frame_seen'
    ws.send_json({'type':'inspect_components'})
    result=until(ws,'component_scene')[-1]['scene']
    until(ws,'turn_complete')
    return record['id'], result

def correction(scene,**values):
    return {'revision':scene['revision'],'component_id':'board1','part_id':'esp32',
            'variant_id':'devkit-v1-30','value_text':None,'note':'I checked all 30 headers and matching printed order.',**values}

def test_live_inspection_loads_references_without_assuming_values_or_pins(component_client):
    headers,token=login(component_client)
    with component_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        id,scene=open_and_inspect(component_client,ws,token)
        assert scene['frame_id']=='frame-1' and scene['timestamp_ms']>=0
        assert all(not p['confirmed'] and p['variant_id'] is None for p in scene['components'])
        assert scene['components'][1]['value_text'] is None
        assert len(scene['questions'])==2
        bridge=ComponentBridge.instances[0]
        assert any(k=='tool_response' and v[0].response['accepted'] for k,v in bridge.sent)
        assert component_client.app.state.coach.active.record['turns']==1
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')
    saved=component_client.get(f'/api/coaching/sessions/{id}/components',headers=headers).json()
    assert saved==scene
    assert component_client.portal.call(component_client.app.state.store.all,'assessment')==[]
    assert component_client.portal.call(component_client.app.state.store.all,'frame')==[]

def test_manual_variant_confirmation_is_owned_versioned_and_not_a_checkpoint_pass(component_client):
    headers,token=login(component_client)
    with component_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        id,scene=open_and_inspect(component_client,ws,token)
        other,_=login(component_client,'student')
        path=f'/api/coaching/sessions/{id}/components'
        assert component_client.get(path,headers=other).status_code==403
        assert component_client.patch(path,headers=other,json=correction(scene)).status_code==403
        response=component_client.patch(path,headers=headers,json=correction(scene))
        assert response.status_code==200
        updated=response.json(); assert updated['revision']==2
        assert updated['components'][0]['confirmed'] and updated['components'][0]['variant_id']=='devkit-v1-30'
        until(ws,'component_scene')
        assert component_client.patch(path,headers=headers,json=correction(scene)).status_code==409
        assert component_client.patch(path,headers=headers,json=correction(updated,part_id='led')).status_code==409
        assert component_client.portal.call(component_client.app.state.store.all,'assessment')==[]
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')

@pytest.mark.parametrize('args',[
    {'frame_id':'frame-1','components':[{'id':'x','part_id':'made-up-part','evidence':'Visible'}]},
    {'frame_id':'frame-1','components':[{'id':'x','part_id':'esp32','evidence':'Visible','variant_id':'devkit-v1-30','confirmed':True}]},
    {'frame_id':'different-frame','components':[]},
])
def test_invalid_or_stale_model_tool_never_replaces_inventory(component_client,args):
    _,token=login(component_client)
    with component_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        _,scene=open_and_inspect(component_client,ws,token)
        active=component_client.app.state.coach.active
        active.inspection={'frame_id':'frame-1','timestamp_ms':0,'requested_at':__import__('time').monotonic(),'revision':scene['revision']}
        response=component_client.portal.call(active.component_tool,types.FunctionCall(id='bad',name='show_components',args=args))
        assert not response.response['accepted']
        until(ws,'component_notice')
        assert active.record['component_scene']==scene
        rejected=[m for m in component_client.portal.call(component_client.app.state.store.all,'metric')
                  if m.get('operation')=='component_result_rejected']
        assert rejected and rejected[-1]['reason']
        assert 'made-up-part' not in str(rejected) and 'different-frame' not in str(rejected)
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')

def test_no_camera_request_preserves_state_without_model_inference(component_client):
    _,token=login(component_client)
    with component_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        ws.send_json({'type':'inspect_components'})
        until(ws,'component_notice')
        assert ComponentBridge.instances[0].sent==[]
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')

def test_catalogue_metadata_requires_auth_and_has_no_lesson_checklist(component_client):
    assert component_client.get('/api/components/catalogue').status_code==401
    headers,_=login(component_client)
    catalogue=component_client.get('/api/components/catalogue',headers=headers).json()
    assert len(catalogue['parts'])==6 # five supported families plus explicit unknown
    esp=catalogue['parts'][0]; pins=esp['variants'][0]['pins']
    assert next(p for p in pins if p['id']=='D23')['z']==pytest.approx(-2.1)
    assert len(pins)==30 and len({p['id'] for p in pins})==30
    assert all('steps' not in p and 'target_circuit' not in p for p in catalogue['parts'])

def test_unreadable_values_and_unmatched_variants_remain_unresolved():
    with pytest.raises(ValidationError):
        InspectionOutput(frame_id='frame-1',components=[{'id':'r','part_id':'resistor','evidence':'Bands unreadable','value_text':'220 ohms'}])
    scene=ComponentScene(components=[ScenePart(id='r',part_id='resistor',evidence='Bands unreadable')])
    corrected=edit_part(scene,PartEdit(revision=0,component_id='r',part_id='resistor',note='Value remains unreadable'))
    assert corrected.components[0].value_text is None
    assert corrected.components[0].variant_id is None
    assert scene.revision==0 # failed/stale validation cannot mutate the original

def test_pause_clears_pending_inspection_and_resume_restores_normal_guidance(component_client):
    _,token=login(component_client)
    with component_client.websocket_connect('/api/coaching/stream',headers={'origin':'http://localhost:8000'}) as ws:
        authenticate(ws,token)
        active=component_client.app.state.coach.active
        active.inspection={'frame_id':'frame-1'}; active.inspecting_turn=True
        ws.send_json({'type':'audio','data':'AAAAAA=='}) # not forwarded while inspection owns the turn
        ws.send_json({'type':'control','action':'pause'}); until(ws,'status')
        assert active.inspection is None and not active.inspecting_turn
        ws.send_json({'type':'control','action':'resume'}); until(ws,'ready')
        ws.send_json({'type':'text','text':'Continue with normal guidance'})
        until(ws,'turn_complete')
        assert ComponentBridge.instances[-1].sent[-1]==('text','Continue with normal guidance')
        ws.send_json({'type':'control','action':'finish'}); until(ws,'finished')

@pytest.mark.asyncio
async def test_snapshot_and_request_use_one_ordered_sdk_turn():
    class Session:
        async def send_client_content(self,*,turns,turn_complete):
            assert turns.role=='user' and turn_complete
            assert turns.parts[0].inline_data.data==b'synthetic-jpeg'
            assert turns.parts[0].inline_data.mime_type=='image/jpeg'
            assert turns.parts[1].text=='Inspect frame-5'
    bridge=LiveBridge(FakeAI(),'Generic instructions'); bridge.session=Session()
    await bridge.send('inspect',{'image':b'synthetic-jpeg','text':'Inspect frame-5'})
