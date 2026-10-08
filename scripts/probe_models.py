"""Small real API access gate, never a claim about actual free account quotas."""
import argparse
import asyncio
import io
import json
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from PIL import Image
from app.ai import Gemini, AIError, ER2Stream, OBSERVER
from app.config import Settings
from app.models import ObservationBatch
from app.services import Service
from app.storage import Store

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='artifacts/model-access.json')
    args = parser.parse_args()
    settings = Settings(); ai = Gemini(settings)
    try: ai.ready()
    except AIError as exc: raise SystemExit(str(exc))
    store = Store(settings); service = Service(settings, store, ai)
    report = {'account_free_quotas': 'Check and record actual limits in AI Studio; this script cannot inspect billing or quotas.', 'results': []}
    b = io.BytesIO(); Image.new('RGB', (160, 120), '#dddddd').save(b, format='JPEG')
    frames = [{'id': 'access-probe-frame', 'timestamp_ms': 1000, 'bytes': b.getvalue()}]
    try:
        for model in dict.fromkeys([settings.general_model, settings.physical_assessor, settings.fallback_model]):
            start = time.monotonic()
            try:
                await service.reserve_call()
                output = await ai.structured(model, OBSERVER, 'This is a synthetic access probe. Describe only visible evidence; no task is demonstrated.', ObservationBatch, frames)
                report['results'].append({'model': model, 'accessible': True, 'latency_ms': round((time.monotonic()-start)*1000), 'usage': ai.last_usage, 'output': output.model_dump()})
            except AIError as exc:
                if exc.code == 'quota': await service.block_quota()
                report['results'].append({'model': model, 'accessible': False, 'code': exc.code, 'error': str(exc)})
                if exc.code in ('quota', 'daily_limit'): break
        if not any(r.get('code') in ('quota', 'daily_limit') for r in report['results']):
            stream = ER2Stream(ai)
            start = time.monotonic()
            try:
                await service.reserve_call(); await stream.open(); await stream.frame(frames[0])
                output = await stream.observe([], frames, b'')
                report['results'].append({'model': stream.model, 'accessible': True, 'latency_ms': round((time.monotonic()-start)*1000), 'output': output.model_dump(), 'usage': ai.last_usage})
            except AIError as exc:
                if exc.code == 'quota': await service.block_quota()
                report['results'].append({'model': stream.model, 'accessible': False, 'code': exc.code, 'error': str(exc)})
            finally: await stream.close()
    finally:
        await store.close()
        path = Path(args.output); path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Access probe saved to {args.output}. Run the five-minute narrated capture gate next.')

if __name__ == '__main__':
    asyncio.run(main())

