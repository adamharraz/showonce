param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) { throw 'Create .venv and install backend requirements first. See README.md.' }
if (-not (Test-Path -LiteralPath 'frontend\dist\index.html')) { throw 'Run npm ci --prefix frontend and npm run build --prefix frontend first.' }
& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port $Port --ws-max-size 1500000

