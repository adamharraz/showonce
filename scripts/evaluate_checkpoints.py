"""Evaluate labelled examples. Labels never enter model prompts. No paid fallback."""
import argparse
import asyncio
from collections import Counter
import io
import json
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from PIL import Image, ImageOps
from app.ai import Gemini, AIError, ASSESSOR
from app.config import Settings
from app.models import Step, AssessmentOutput
from app.services import Service, guard_assessment
from app.storage import Store

def images(paths, prefix, root):
    result = []
    for i, name in enumerate(paths):
        with Image.open(root / name) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
            if image.width > 1600: image = image.resize((1600, round(image.height * 1600 / image.width)))
            b = io.BytesIO(); image.save(b, format='JPEG', quality=82)
        result.append({'id': f'{prefix}-{i}', 'timestamp_ms': i*1000, 'bytes': b.getvalue()})
    return result

def summarize(rows):
    labels = {'correct': 'met', 'incorrect': 'correction', 'unclear': 'clearer_view'}
    groups = {}
    for model in dict.fromkeys(r['model'] for r in rows):
        cases = [r for r in rows if r['model']==model]
        valid = [r for r in cases if 'output' in r]
        confusion = Counter(f"{r['label']} -> {r.get('output',{}).get('outcome','error')}" for r in cases)
        groups[model] = {'tested': len(cases), 'errors': len(cases)-len(valid), 'false_passes': sum(r['label']!='correct' and r.get('output',{}).get('outcome')=='met' for r in cases), 'accuracy': sum(r.get('output',{}).get('outcome')==labels[r['label']] for r in cases)/len(cases) if cases else 0, 'confusion': dict(confusion)}
    comparable = len(groups)>1 and len({g['tested'] for g in groups.values()})==1 and not any(g['errors'] for g in groups.values())
    selected = min(groups, key=lambda m:(groups[m]['false_passes'], -groups[m]['accuracy'], 0 if 'flash' in m else 1)) if comparable else None
    return {'models': groups, 'recommended_model': selected, 'selection_valid': comparable, 'note': 'Request latency excludes capture scheduling and queue time. Validate stable-outcome-to-visible-feedback timing in the live app.'}

async def main():
    p=argparse.ArgumentParser(); p.add_argument('dataset'); p.add_argument('--models', nargs='+', default=['gemini-robotics-er-2-preview','gemini-3.8-flash']); p.add_argument('--output', default='artifacts/checkpoints.json'); args=p.parse_args()
    dataset=Path(args.dataset).resolve()
    cases=[json.loads(line) for line in dataset.read_text(encoding='utf-8').splitlines() if line.strip()]
    if not cases or any(c['label'] not in ('correct','incorrect','unclear') for c in cases): raise SystemExit('Every example needs an id, approved step, images and a valid label.')
    if len({c['id'] for c in cases}) != len(cases): raise SystemExit('Example IDs must be unique.')
    settings=Settings(); ai=Gemini(settings)
    try: ai.ready()
    except AIError as exc: raise SystemExit(str(exc))
    store=Store(settings); service=Service(settings,store,ai); rows=[]; stop=False
    try:
        for model in args.models:
            if stop: break
            for c in cases:
                step=Step.model_validate(c['step']).model_dump()
                references=images(c['references'],'teacher-'+c['id'],dataset.parent)
                student=images(c['student'],'student-'+c['id'],dataset.parent)
                if not references or not student: raise ValueError('Each example needs teacher and student evidence.')
                started=time.monotonic(); row={'id':c['id'],'label':c['label'],'checkpoint_class':c.get('checkpoint_class','unspecified'),'model':model}
                try:
                    await service.reserve_call()
                    prompt=json.dumps({'step':step,'teacher_reference_ids':[f['id'] for f in references],'student_frame_ids':[f['id'] for f in student]})
                    result=await ai.structured(model,ASSESSOR,prompt,AssessmentOutput,[*references,*student])
                    guard_assessment(step,result,[f['id'] for f in student])
                    row.update(output=result.model_dump(),usage=ai.last_usage)
                except (AIError,ValueError) as exc:
                    if isinstance(exc,AIError) and exc.code=='quota': await service.block_quota()
                    row.update(error=str(exc),code=getattr(exc,'code','invalid_output'))
                    if row['code'] in ('quota','daily_limit'): stop=True
                row['latency_ms']=round((time.monotonic()-started)*1000); rows.append(row)
                path=Path(args.output); path.parent.mkdir(parents=True,exist_ok=True)
                path.write_text(json.dumps({'results':rows,'summary':summarize(rows)},indent=2),encoding='utf-8')
                if stop: break
    finally: await store.close()
    print(json.dumps(summarize(rows),indent=2))

if __name__=='__main__': asyncio.run(main())
