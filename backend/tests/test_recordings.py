import json
import shutil
import subprocess
import time
import pytest
from app.models import LessonDraft, Step, Criterion
from app.config import FINAL_MODEL
from tests.test_app import client, login, wait_job


@pytest.fixture
def video(tmp_path):
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        pytest.skip('FFmpeg required for media integration tests')
    path = tmp_path/'synthetic.webm'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=15', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libvpx', '-c:a', 'libopus', str(path)], check=True, capture_output=True)
    return path.read_bytes()


def session(client):
    headers, token = login(client)
    value = client.post('/api/sessions', headers=headers, json={'mode': 'teach', 'source': 'camera', 'recording_required': True}).json()
    url = '/api/sessions/'+value['id']+'/recording'
    assert client.post(url+'/start', headers=headers, json={'mime':'video/webm', 'audio': True, 'start_ms':0}).status_code == 200
    return headers, value, url


def test_recording_verified_and_whole_video_finalized(client, video):
    headers, value, url = session(client)
    pieces = [video[:len(video)//2], video[len(video)//2:]]
    for i, data in enumerate(pieces):
        assert client.post(url+f'/chunks/{i}', headers=headers, content=data).status_code == 200
        assert client.post(url+f'/chunks/{i}', headers=headers, content=data).status_code == 200
    assert client.post(url+'/chunks/0', headers=headers, content=b'different').status_code == 409
    result = client.post(url+'/complete', headers=headers, json={'count':2, 'duration_ms':2000})
    assert result.status_code == 200, result.text
    assert result.json()['audio_present'] is True
    calls = []
    async def finalize_video(path, record, gaps):
        calls.append(record)
        assert path.exists() and record['duration_ms'] >= 1900
        client.app.state.service.ai.actual_model = FINAL_MODEL
        return LessonDraft(title='Synthetic blue screen', steps=[Step(title='Display blue', instruction='Display the blue background.', expected_outcome='Blue is visible.', timestamp_ms=1000, criteria=[Criterion(description='Blue visible', mode='visual')])])
    client.app.state.service.ai.finalize_video = finalize_video
    assert client.post('/api/sessions/'+value['id']+'/finalize', headers=headers).status_code == 202
    state = wait_job(client, headers, value['id'])
    assert state['job']['state'] == 'complete', state
    lesson = client.get('/api/lessons/'+value['lesson_id']+'/draft', headers=headers).json()
    assert lesson['draft']['steps'][0]['evidence_ids']
    assert len(calls) == 1


def test_missing_corrupt_or_wrong_duration_media_never_finalizes(client, video):
    headers, value, url = session(client)
    assert client.post(url+'/chunks/1', headers=headers, content=video).status_code == 200
    assert client.post(url+'/complete', headers=headers, json={'count':2,'duration_ms':2000}).status_code == 409
    assert client.post('/api/sessions/'+value['id']+'/finalize', headers=headers).status_code == 409
    assert client.post(url+'/chunks/0', headers=headers, content=b'corrupt').status_code == 200
    assert client.post(url+'/complete', headers=headers, json={'count':2,'duration_ms':2000}).status_code == 422


def test_recording_ownership_and_scoped_phone_token(client):
    headers, value, url = session(client)
    student, _ = login(client, 'student')
    assert client.get(url, headers=student).status_code == 403
    token = client.app.state.service.recordings.capture_token(value['id'])
    assert client.get(url, headers={'X-Capture-Token': token}).status_code == 200
    assert client.get(url, headers={'X-Capture-Token': token+'bad'}).status_code == 401


def test_full_recording_preview_backlog_never_pauses_capture(client):
    from app.models import FrameMessage
    from tests.test_app import frame_data
    headers, value, url = session(client)
    runtime = client.app.state.service.runtimes[value['id']]
    async def accumulate():
        for i in range(55):
            await runtime.frame(FrameMessage(type='frame', id=f'sample-{i}', timestamp_ms=(i+1)*1000, data=frame_data()))
        assert runtime.session['state'] == 'capturing'
        assert len(runtime.frames) <= 40
    client.portal.call(accumulate)
