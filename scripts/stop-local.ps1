$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskState = Join-Path $taskRoot '.data\local-server.json'
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskState)) { Write-Output 'No launcher-managed ShowOnce server is recorded.'; exit 0 }
$taskSaved = Get-Content -LiteralPath $taskState -Raw | ConvertFrom-Json
$taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskSaved.pid)" -ErrorAction SilentlyContinue
if ($null -ne $taskProcess) {
    if ($taskProcess.ExecutablePath -ne $taskPython -or $taskProcess.CommandLine -notmatch 'uvicorn app.main:app') { throw 'The recorded process belongs to something else. No process was stopped.' }
    # Windows venv's python launcher runs the actual interpreter as a child.
    $taskChildren = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($taskSaved.pid)"
    foreach ($taskChild in $taskChildren) {
        if ($taskChild.Name -eq 'python.exe' -and $taskChild.CommandLine -match [regex]::Escape($taskPython) -and $taskChild.CommandLine -match 'uvicorn app.main:app') {
            Stop-Process -Id $taskChild.ProcessId -ErrorAction SilentlyContinue
        }
    }
    Stop-Process -Id $taskSaved.pid -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $taskState
Write-Output 'ShowOnce has stopped. Saved lessons remain in showonce\.data.'
