"""Prepare an ignored Python dependency for the managed Linux Node preview host.

Run with the provided standalone CPython runtime (Linux, Python 3.12). This is
not needed on a normal developer machine with an installed Python/venv.
"""
from pathlib import Path
import shutil
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
if not sys.platform.startswith('linux') or sys.version_info[:2] != (3,12):
    raise SystemExit('Use the provided standalone Linux CPython 3.12 runtime.')
dest=root/'.preview-runtime'
(dest/'bin').mkdir(parents=True,exist_ok=True)
shutil.copy2(Path(sys.executable).resolve(),dest/'bin/python3.12')
shutil.copytree(Path(sys.base_prefix)/'lib/python3.12',dest/'lib/python3.12',ignore=shutil.ignore_patterns('site-packages','__pycache__','test','tests','idlelib','tkinter','ensurepip'),dirs_exist_ok=True)
subprocess.run([sys.executable,'-m','pip','install','--no-compile','--target',str(dest/'lib/python3.12/site-packages'),'-r',str(root/'backend/requirements-lock.txt'),'socksio'],check=True)
print('Managed preview runtime prepared. It is ignored by Git.')
