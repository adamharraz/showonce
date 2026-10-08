$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskTemp = Join-Path $taskRoot '.tmp'
New-Item -ItemType Directory -Force -Path $taskTemp | Out-Null
$env:TEMP = $taskTemp
$env:TMP = $taskTemp
$env:PYTHONPATH = Join-Path $taskRoot 'backend'
& '.\.venv\Scripts\python.exe' -m pytest backend\tests -q --basetemp .tmp\pytest
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
& '.\.venv\Scripts\python.exe' backend\export_schema.py
if ($LASTEXITCODE -ne 0) { throw 'Schema export failed' }
& npm run types --prefix frontend
if ($LASTEXITCODE -ne 0) { throw 'API type generation failed' }
& npm test --prefix frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
& npm run build --prefix frontend
if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
Write-Output 'Automated checks passed. Model accuracy, real capture and hosting still require validation.'

