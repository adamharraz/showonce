"""Exercise real SDK serialization/response parsing without external requests."""
import json
import httpx
import pytest
from google import genai
from google.genai import types
from app.ai import AIError, Gemini
from app.config import MODEL, Settings
from app.models import ObservationBatch, LessonDraft, AssessmentOutput

@pytest.mark.asyncio
async def test_structured_adapter_uses_supported_wire_schema(tmp_path):
    model = MODEL
    payload = json.dumps({'task_title': 'Transport check', 'observations': []})
    requests = []
    def respond(request):
        requests.append(request)
        body = json.loads(request.content)
        assert body['model'] == MODEL
        assert body['response_format']['type'] == 'text'
        assert body['response_format']['schema']['additionalProperties'] is False
        assert '$defs' not in body['response_format']['schema']
        assert 'maxLength' not in json.dumps(body['response_format']['schema'])
        assert set(body['response_format']['schema']['required']) == {'task_title', 'observations'}
        return httpx.Response(200, json={'id': 'offline-interaction', 'model': model, 'status': 'completed',
            'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': payload}]}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
        settings = Settings(data_dir=tmp_path, gemini_key='offline-test-key', free_tier_confirmed=True)
        ai = Gemini(settings)
        ai.client = genai.Client(api_key='offline-test-key', http_options=types.HttpOptions(httpx_async_client=transport, retry_options=types.HttpRetryOptions(attempts=1)))
        try:
            result = await ai.structured(model, 'Extract only visible evidence.', 'Synthetic transport check.', ObservationBatch)
            assert result.task_title == 'Transport check'
            assert len(requests) == 1
        finally:
            await ai.client.aio.aclose()

@pytest.mark.asyncio
@pytest.mark.parametrize('schema, payload', [
    (LessonDraft, {'title': 'Synthetic lesson', 'steps': [{'title': 'Draw', 'instruction': 'Draw a circle.', 'expected_outcome': 'A circle is visible.', 'evidence_ids': ['frame-1'], 'criteria': [{'description': 'Circle visible', 'mode': 'visual'}]}]}),
    (AssessmentOutput, {'outcome': 'clearer_view', 'explanation': 'The endpoint is obscured.', 'evidence_ids': ['student-1'], 'criteria': []}),
])
async def test_nested_tutorial_and_assessment_results_are_parsed(schema, payload, tmp_path):
    def respond(request):
        return httpx.Response(200, json={'id': 'offline-interaction', 'status': 'completed',
            'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': json.dumps(payload)}]}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
        ai = Gemini(Settings(data_dir=tmp_path, gemini_key='offline-test-key', free_tier_confirmed=True))
        ai.client = genai.Client(api_key='offline-test-key', http_options=types.HttpOptions(httpx_async_client=transport))
        try:
            result = await ai.structured(MODEL, 'Use supplied evidence.', 'Synthetic test.', schema)
            assert isinstance(result, schema)
        finally:
            await ai.client.aio.aclose()

@pytest.mark.asyncio
@pytest.mark.parametrize('payload', ['{"task_title":"' + ('x' * 201) + '","observations":[]}', 'This is not JSON.'])
async def test_full_local_validation_rejects_invalid_model_output(payload, tmp_path):
    def respond(request):
        return httpx.Response(200, json={'id': 'offline-interaction', 'status': 'completed',
            'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': payload}]}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
        ai = Gemini(Settings(data_dir=tmp_path, gemini_key='offline-test-key', free_tier_confirmed=True))
        ai.client = genai.Client(api_key='offline-test-key', http_options=types.HttpOptions(httpx_async_client=transport))
        try:
            from app.ai import AIError
            with pytest.raises(AIError) as error:
                await ai.structured(MODEL, 'Use supplied evidence.', 'Synthetic test.', ObservationBatch)
            assert error.value.code == 'invalid_output'
        finally:
            await ai.client.aio.aclose()

@pytest.mark.asyncio
@pytest.mark.parametrize('status, code', [(403, 'model_unavailable'), (404, 'model_unavailable'), (429, 'quota'), (503, 'model_busy')])
async def test_request_failure_is_classified_without_hidden_retries(status, code, tmp_path):
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(status, json={'error': {'message': 'Synthetic service failure', 'code': 'resource_exhausted' if status == 429 else 'service_unavailable'}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
        ai = Gemini(Settings(data_dir=tmp_path, gemini_key='offline-test-key', free_tier_confirmed=True))
        ai.client = genai.Client(api_key='offline-test-key', http_options=types.HttpOptions(httpx_async_client=transport, retry_options=types.HttpRetryOptions(attempts=1)))
        try:
            from app.ai import AIError
            with pytest.raises(AIError) as error:
                await ai.general('Extract visible evidence.', 'Synthetic test.', ObservationBatch)
            assert error.value.code == code
            assert len(requests) == 1
        finally:
            await ai.client.aio.aclose()

@pytest.mark.asyncio
@pytest.mark.parametrize('model', ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-robotics-er-2-preview', 'gemini-robotics-er-2-streaming-preview'])
async def test_other_models_are_rejected_before_any_request(model, tmp_path):
    requests = []
    def respond(request):
        requests.append(request)
        raise AssertionError('A forbidden model must never reach the transport')
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
        ai = Gemini(Settings(data_dir=tmp_path, gemini_key='offline-test-key', free_tier_confirmed=True))
        ai.client = genai.Client(api_key='offline-test-key', http_options=types.HttpOptions(httpx_async_client=transport))
        try:
            with pytest.raises(AIError) as error:
                await ai.structured(model, 'Use supplied evidence.', 'Synthetic test.', ObservationBatch)
            assert error.value.code == 'model_not_allowed'
            assert requests == []
        finally:
            await ai.client.aio.aclose()

def test_legacy_environment_cannot_select_another_model(monkeypatch, tmp_path):
    for key in ('GENERAL_MODEL', 'GENERAL_FALLBACK_MODEL', 'PHYSICAL_ASSESSOR'):
        monkeypatch.setenv(key, 'gemini-3.8-flash')
    monkeypatch.setenv('PHYSICAL_OBSERVER', 'er2')
    settings = Settings(data_dir=tmp_path, gemini_key='')
    assert settings.general_model == MODEL

@pytest.mark.asyncio
@pytest.mark.parametrize('operation', ['observe', 'finalize', 'revise', 'physical_assessment', 'screen_assessment'])
async def test_every_ai_role_uses_flash_lite(operation, tmp_path):
    if operation == 'observe':
        payload = {'task_title': 'Test activity', 'observations': []}
    elif operation in ('finalize', 'revise'):
        payload = {'title': 'Test lesson', 'steps': []}
    else:
        payload = {'outcome': 'clearer_view', 'explanation': 'More evidence is needed.', 'evidence_ids': [], 'criteria': []}
    requests = []
    def respond(request):
        requests.append(request)
        body = json.loads(request.content)
        assert body['model'] == MODEL
        return httpx.Response(200, json={'id': 'offline-interaction', 'status': 'completed',
            'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': json.dumps(payload)}]}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
        ai = Gemini(Settings(data_dir=tmp_path, gemini_key='offline-test-key', free_tier_confirmed=True))
        ai.client = genai.Client(api_key='offline-test-key', http_options=types.HttpOptions(httpx_async_client=transport))
        try:
            if operation == 'observe':
                await ai.observe([], [], b'')
            elif operation == 'finalize':
                await ai.finalize([], [], [])
            elif operation == 'revise':
                await ai.revise({'title': 'Test lesson', 'steps': []}, [])
            else:
                await ai.assess({'criteria': []}, [], [], operation == 'physical_assessment')
            assert len(requests) == 1
            assert ai.actual_model == MODEL
        finally:
            await ai.client.aio.aclose()
