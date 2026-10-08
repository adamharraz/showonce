param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
$taskState = Join-Path $taskRoot '.data\local-server.json'
$taskUrl = 'http://localhost:8000'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Python environment is missing. See README.md.' }
if (-not (Test-Path -LiteralPath 'frontend\dist\index.html')) { throw 'Frontend build is missing. See README.md.' }
New-Item -ItemType Directory -Force -Path '.data\logs' | Out-Null
$taskOwned = $false
if (Test-Path -LiteralPath $taskState) {
    $taskSaved = Get-Content -LiteralPath $taskState -Raw | ConvertFrom-Json
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskSaved.pid)" -ErrorAction SilentlyContinue
    $taskOwned = $null -ne $taskProcess -and $taskProcess.ExecutablePath -eq $taskPython -and $taskProcess.CommandLine -match 'uvicorn app.main:app'
}
if (-not $taskOwned) {
    $taskListener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 8000)
    try { $taskListener.Start() }
    catch { throw 'Port 8000 is already occupied. Close the other ShowOnce server before using this launcher.' }
    finally { $taskListener.Stop() }
    $taskProcess = Start-Process -FilePath $taskPython -ArgumentList @('-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port','8000','--ws-max-size','1500000') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput '.data\logs\server.out.log' -RedirectStandardError '.data\logs\server.err.log' -PassThru
    @{pid=$taskProcess.Id; url=$taskUrl; root=$taskRoot} | ConvertTo-Json | Set-Content -LiteralPath $taskState -Encoding UTF8
}
$taskReady = $false
for ($taskTry = 0; $taskTry -lt 30; $taskTry++) {
    try {
        $taskHealth = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        if ($taskHealth.status -eq 'ok') { $taskReady = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
}
if (-not $taskReady) { throw 'Server did not start. Check showonce\.data\logs\server.err.log.' }
Write-Output "ShowOnce is running at $taskUrl. AI ready: $($taskHealth.ai_ready)"
if (-not $NoBrowser) { Start-Process $taskUrl }
