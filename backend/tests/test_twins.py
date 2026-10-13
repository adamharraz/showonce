"""Synthetic job transport fixtures; never substituted for production inference."""
import asyncio
import base64
import io
import json
import struct
import time
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app.config import Settings
from app.main import create_app
from app.twins import validate_glb
from tests.test_app import FakeAI, login

def sample_glb(external=False):
    # One coloured triangle with genuine glTF geometry, for loader transport tests.
    binary=struct.pack('<9f',0.,0.,0.,1.,0.,0.,0.,1.,0.)
    document={'asset':{'version':'2.0','generator':'ShowOnce isolated test fixture'},'scene':0,
        'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
        'meshes':[{'primitives':[{'attributes':{'POSITION':0},'material':0}]}],
        'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[.2,.8,.6,1.],'metallicFactor':0.,'roughnessFactor':.6},'doubleSided':True}],
        'buffers':[{'byteLength':len(binary)}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(binary)}],
        'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3','min':[0.,0.,0.],'max':[1.,1.,0.]}]}
    if external: document['buffers'][0]['uri']='https://invalid.example/private'
    encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    return struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(binary))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(binary),0x004E4942)+binary

def photo(colour='red'):
    output=io.BytesIO();Image.new('RGB',(120,100),colour).save(output,format='JPEG')
    return base64.b64encode(output.getvalue()).decode()

class FakeTwinProvider:
    def __init__(self):self.calls=[];self.fail=False;self.wait=False
    async def submit(self,stage,photo=None,remove_background=True):
        self.calls.append({'stage':stage,'photo':photo,'remove_background':remove_background})
        return f'fixture-{stage}-{len(self.calls)}'
    async def poll(self,id):
        if self.wait:return False,None
        if self.fail:raise RuntimeError('A synthetic provider failure with a SECRET that must never be exposed')
        return True, {'ready':True} if 'prepare' in id else {'glb':sample_glb(),'generation_seconds':.01}

@pytest.fixture
def twin_client(tmp_path):
    provider=FakeTwinProvider()
    settings=Settings(data_dir=tmp_path,gemini_key='',free_tier_confirmed=True,twin_enabled=True,
        twin_free_confirmed=True,storage_mode='local',allow_local_login=True)
    app=create_app(settings,FakeAI(),twin_provider=provider)
    with TestClient(app) as client:
        client.provider=provider
        yield client

def create(client,headers,id='request-1',**kwargs):
    return client.post('/api/twins',headers=headers,json={'request_id':id,'image':photo(),'title':'Synthetic test build','consent':True,**kwargs})

def settled(client,headers,id):
    deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        record=client.get('/api/twins/'+id,headers=headers).json()
        if record['state'] in ('ready','error','interrupted'):return record
        time.sleep(.03)
    raise AssertionError('Synthetic job did not settle')

def test_photo_to_private_glb_and_identical_requests_never_duplicate_gpu_work(twin_client):
    headers,_=login(twin_client)
    response=create(twin_client,headers);assert response.status_code==202
    id=response.json()['id'];record=settled(twin_client,headers,id)
    assert record['state']=='ready' and record['byte_size']>100
    assert 'owner_id' not in record and 'call_id' not in record and 'model_key' not in record
    data=twin_client.get(f'/api/twins/{id}/model',headers=headers)
    assert data.status_code==200 and data.headers['content-type']=='model/gltf-binary'
    assert data.content==sample_glb()
    assert create(twin_client,headers).json()['id']==id
    assert create(twin_client,headers,id='request-2').json()['reused']
    assert [c['stage'] for c in twin_client.provider.calls]==['prepare','generate']
    assert twin_client.provider.calls[1]['photo'].startswith(b'\xff\xd8')
    assert twin_client.portal.call(twin_client.app.state.store.all,'assessment')==[]

def test_jobs_photos_and_models_are_owner_only(twin_client):
    headers,_=login(twin_client);other,_=login(twin_client,'student')
    id=create(twin_client,headers).json()['id'];settled(twin_client,headers,id)
    for suffix in ('','/model','/photo','/retry'):
        method=twin_client.post if suffix=='/retry' else twin_client.get
        assert method('/api/twins/'+id+suffix,headers=other).status_code==403
    assert twin_client.get('/api/twins',headers=other).json()==[]
    assert twin_client.get('/api/twins/'+id).status_code==401

def test_invalid_photo_and_missing_consent_never_submit(twin_client):
    headers,_=login(twin_client)
    assert create(twin_client,headers,image='invalid base64').status_code==422
    assert create(twin_client,headers,consent=False).status_code==422
    assert twin_client.provider.calls==[]

def test_not_configured_and_zero_spend_guard_never_submit(twin_client):
    headers,_=login(twin_client)
    twin_client.app.state.twins.settings.twin_free_confirmed=False
    assert create(twin_client,headers).status_code==503
    twin_client.app.state.twins.settings.twin_free_confirmed=True
    twin_client.app.state.twins.settings.twin_enabled=False
    assert create(twin_client,headers).status_code==503
    assert twin_client.provider.calls==[]

def test_failure_is_saved_without_automatic_retry_or_secret_leak(twin_client):
    headers,_=login(twin_client);twin_client.provider.fail=True
    id=create(twin_client,headers).json()['id'];record=settled(twin_client,headers,id)
    assert record['state']=='error' and 'SECRET' not in record['error']
    assert len(twin_client.provider.calls)==1
    assert twin_client.get('/api/twins/'+id+'/photo',headers=headers).status_code==200
    twin_client.provider.fail=False
    retry=twin_client.post('/api/twins/'+id+'/retry',headers=headers)
    assert retry.status_code==202
    assert settled(twin_client,headers,retry.json()['id'])['state']=='ready'

def test_concurrent_job_and_budget_reservation_are_persistent(twin_client):
    headers,_=login(twin_client);twin_client.provider.wait=True
    assert create(twin_client,headers).status_code==202
    assert create(twin_client,headers,id='another',image=photo('blue')).status_code==409
    usage=twin_client.portal.call(twin_client.app.state.store.get,'twin_budget','sf3d-budget')
    assert usage['attempts']==1

@pytest.mark.parametrize('data',[b'not a glb',sample_glb(True),sample_glb()[:-4]])
def test_generated_models_cannot_fetch_external_urls_or_use_corrupt_payloads(data):
    with pytest.raises(ValueError):validate_glb(data)

def test_restart_resumes_existing_remote_call_without_resubmission(twin_client):
    headers,_=login(twin_client)
    record={'id':'recovered','owner_id':'local-instructor','request_id':'old-request','title':'Recovered test','state':'generating',
        'created_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'updated_at':'unused','call_id':'fixture-generate-already-spawned','photo_key':None,'model_key':None,
        'remove_background':True,'model':'stabilityai/stable-fast-3d','byte_size':0,'generation_seconds':None,'error':None}
    manager=twin_client.app.state.twins
    twin_client.portal.call(manager.store.put,'twin',record)
    twin_client.portal.call(manager.watch,record)
    assert settled(twin_client,headers,'recovered')['state']=='ready'
    assert twin_client.provider.calls==[]

def test_disabled_generation_does_not_spawn_gpu_after_preparation_recovers(twin_client):
    headers,_=login(twin_client)
    manager=twin_client.app.state.twins;manager.settings.twin_enabled=False
    stamp=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    record={'id':'disabled-recovery','owner_id':'local-instructor','request_id':'old-request','title':'Disabled recovery test',
        'state':'preparing','created_at':stamp,'updated_at':stamp,'call_id':'fixture-prepare-already-spawned',
        'photo_key':None,'model_key':None,'remove_background':True,'model':'stabilityai/stable-fast-3d',
        'byte_size':0,'generation_seconds':None,'error':None}
    twin_client.portal.call(manager.store.put,'twin',record)
    twin_client.portal.call(manager.watch,record)
    assert settled(twin_client,headers,record['id'])['state']=='error'
    assert twin_client.provider.calls==[]
