"""Exercise real SDK serialization/response parsing without external requests."""
import json
import httpx
import pytest
from google import genai
from google.genai import types
from app.ai import Gemini
from app.config import Settings
from app.models import ObservationBatch, LessonDraft, AssessmentOutput

@pytest.mark.asyncio
@pytest.mark.parametrize('model', ['gemini-3.8-flash', 'gemini-2.5-flash'])
async def test_structured_adapter_uses_supported_wire_schema(model, tmp_path):
    payload = json.dumps({'task_title': 'Transport check', 'observations': []})
    requests = []
    def respond(request):
        requests.append(request)
        body = json.loads(request.content)
        if model.startswith('gemini-2.5'):
            assert 'responseSchema' not in body['generationConfig']
            assert body['generationConfig']['responseJsonSchema']['additionalProperties'] is False
            return httpx.Response(200, json={'candidates': [{'content': {'role': 'model', 'parts': [{'text': payload}]}}]})
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
            result = await ai.structured('gemini-3.5-flash-lite', 'Use supplied evidence.', 'Synthetic test.', schema)
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
                await ai.structured('gemini-3.5-flash-lite', 'Use supplied evidence.', 'Synthetic test.', ObservationBatch)
            assert error.value.code == 'invalid_output'
        finally:
            await ai.client.aio.aclose()

@pytest.mark.asyncio
@pytest.mark.parametrize('status, code', [(429, 'quota'), (503, 'model_busy')])
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
                await ai.structured('gemini-3.8-flash', 'Extract visible evidence.', 'Synthetic test.', ObservationBatch)
            assert error.value.code == code
            assert len(requests) == 1
        finally:
            await ai.client.aio.aclose()
