"""Activate only after model access + owner-confirmed credit-only Modal controls.

Usage: python scripts/activate_twins.py --zero-spend-confirmed
Tokens stay in Modal Secrets, never in this script or frontend configuration.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--zero-spend-confirmed',action='store_true')
    args=parser.parse_args()
    if not args.zero_spend_confirmed:
        raise SystemExit('First verify Modal credits and a US$0 workspace spend limit. No cloud changes were made.')
    root=Path(__file__).resolve().parents[1]
    task_env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'}
    result=subprocess.run([sys.executable,'-m','modal','deploy','modal_app/sf3d_worker.py','--env','main'],cwd=root,env=task_env)
    if result.returncode:raise SystemExit(result.returncode)
    import modal
    # CPU-only gated weight preparation must pass before generation is enabled.
    worker=modal.Function.from_name('showonce-sf3d','prepare_model',environment_name='main')
    result=await worker.remote.aio()
    if not result.get('ready'):raise SystemExit('Model preparation failed. The app remains disabled.')
    env_file=root/'backend/.env'
    text=env_file.read_text(encoding='utf-8-sig') if env_file.exists() else ''
    replacements={'TWIN_ENABLED':'true','TWIN_FREE_CREDITS_CONFIRMED':'true','TWIN_MODAL_APP':'showonce-sf3d','TWIN_MODAL_ENVIRONMENT':'main'}
    lines=[line for line in text.splitlines() if line.split('=',1)[0] not in replacements]
    lines.extend(f'{key}={value}' for key,value in replacements.items())
    env_file.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps({'activated':True,'model':result['model'],'weights_prepared':True,'restart_required':True}))

if __name__=='__main__':asyncio.run(main())
