from tests.test_app import client, login, complete_teaching, publish_lesson


def test_delete_draft_removes_source_and_media_but_preserves_other_lessons(client):
    headers, session, lesson = complete_teaching(client)
    _, other_session, other = complete_teaching(client)
    store = client.app.state.store
    frame = client.portal.call(store.get, 'frame', session['id']+'-frame1')
    path = store.settings.data_dir/'frames'/frame['key']
    chunk_key = 'recordings/'+session['id']+'/0.chunk'
    client.portal.call(store.put_blob, chunk_key, b'synthetic recording')
    client.portal.call(store.put, 'recording', {'id':'recording-'+session['id'], 'session_id':session['id'], 'owner_id':session['owner_id'], 'chunks':[{'key':chunk_key}]})
    assert client.delete('/api/lessons/'+lesson['id'], headers=headers).status_code == 200
    assert client.get('/api/lessons/'+lesson['id']+'/draft', headers=headers).status_code == 404
    assert client.get('/api/sessions/'+session['id'], headers=headers).status_code == 404
    assert not path.exists()
    assert not (store.settings.data_dir/'frames'/chunk_key).exists()
    assert client.get('/api/lessons/'+other['id']+'/draft', headers=headers).status_code == 200
    assert client.get('/api/sessions/'+other_session['id'], headers=headers).status_code == 200
    assert client.delete('/api/lessons/'+lesson['id'], headers=headers).status_code == 404


def test_delete_rejects_students_and_other_instructors(client):
    headers, session, lesson = complete_teaching(client)
    student, _ = login(client, 'student')
    assert client.delete('/api/lessons/'+lesson['id']).status_code == 401
    assert client.delete('/api/lessons/'+lesson['id'], headers=student).status_code == 403
    lesson['owner_id'] = 'another-instructor'
    client.portal.call(client.app.state.store.put, 'lesson', lesson)
    assert client.delete('/api/lessons/'+lesson['id'], headers=headers).status_code == 403


def test_delete_published_lesson_blocks_active_practice_then_removes_versions(client):
    headers, session, lesson, version = publish_lesson(client)
    student, _ = login(client, 'student')
    practice = client.post('/api/sessions', headers=student, json={'mode':'practice','source':'camera','lesson_id':lesson['id'],'version':1}).json()
    assert client.delete('/api/lessons/'+lesson['id'], headers=headers).status_code == 409
    assert client.get('/api/lessons/'+lesson['id']+'/versions/1', headers=student).status_code == 200
    assert client.post('/api/sessions/'+practice['id']+'/finish', headers=student).status_code == 200
    assert client.delete('/api/lessons/'+lesson['id'], headers=headers).status_code == 200
    assert client.get('/api/lessons/'+lesson['id']+'/versions/1', headers=student).status_code == 404
    assert client.get('/api/lessons/'+lesson['id']+'/versions/1/export', headers=student).status_code == 404
    assert all(item['id'] != lesson['id'] for item in client.get('/api/lessons',headers=student).json())
    assert client.get('/api/sessions/'+practice['id'], headers=student).status_code == 200


def test_delete_rejects_pending_generation(client):
    headers, session, lesson = complete_teaching(client)
    job = client.portal.call(client.app.state.store.get, 'job', 'job-'+session['id'])
    job['state'] = 'queued'
    client.portal.call(client.app.state.store.put, 'job', job)
    assert client.delete('/api/lessons/'+lesson['id'], headers=headers).status_code == 409
    assert client.get('/api/lessons/'+lesson['id']+'/draft', headers=headers).status_code == 200
