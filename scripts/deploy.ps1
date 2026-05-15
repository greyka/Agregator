# Deploy Agregator to a remote SBC over SSH.
# Usage:
#   .\scripts\deploy.ps1 -Host 192.168.1.100 -User root
#   .\scripts\deploy.ps1 -Host 192.168.1.100 -User pi -RemotePath /home/pi/agregator

param(
    [Parameter(Mandatory=$true)][string]$RemoteHost,
    [string]$User = "root",
    [string]$RemotePath = "/opt/agregator",
    [int]$Port = 22
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$target = "${User}@${RemoteHost}"

function Invoke-Remote([string]$cmd) {
    Write-Host "[remote] $cmd" -ForegroundColor Cyan
    ssh -p $Port -o StrictHostKeyChecking=accept-new $target $cmd
    if ($LASTEXITCODE -ne 0) { throw "Remote command failed: $cmd" }
}

Write-Host "==> Checking SSH connectivity to $target" -ForegroundColor Yellow
Invoke-Remote "uname -a && cat /etc/os-release | head -3"

Write-Host "==> Ensuring Docker is installed" -ForegroundColor Yellow
Invoke-Remote @"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker $User || true
fi
docker --version
docker compose version || docker-compose version
"@

Write-Host "==> Creating remote dir $RemotePath" -ForegroundColor Yellow
Invoke-Remote "mkdir -p $RemotePath"

Write-Host "==> Syncing project via rsync (or scp fallback)" -ForegroundColor Yellow
$useRsync = $null -ne (Get-Command rsync -ErrorAction SilentlyContinue)
if ($useRsync) {
    rsync -avz --delete `
        --exclude 'node_modules' --exclude '__pycache__' --exclude '.git' `
        --exclude '*.db' --exclude 'dist' `
        -e "ssh -p $Port" `
        "$projectRoot/" "${target}:${RemotePath}/"
} else {
    Write-Host "  rsync not found, using tar+ssh" -ForegroundColor DarkGray
    Push-Location $projectRoot
    try {
        tar --exclude='node_modules' --exclude='__pycache__' --exclude='.git' `
            --exclude='*.db' --exclude='dist' -czf - . |
            ssh -p $Port $target "tar -xzf - -C $RemotePath"
    } finally { Pop-Location }
}
if ($LASTEXITCODE -ne 0) { throw "File sync failed" }

Write-Host "==> Building & starting services" -ForegroundColor Yellow
Invoke-Remote "cd $RemotePath && docker compose up -d --build"

Write-Host "==> Waiting for backend..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Invoke-Remote "curl -fsS http://localhost:8000/ || (docker compose -f $RemotePath/docker-compose.yml logs --tail=50 backend; exit 1)"

Write-Host ""
Write-Host "==> Deployed!" -ForegroundColor Green
Write-Host "    UI:  http://${RemoteHost}:5173"
Write-Host "    API: http://${RemoteHost}:8000/docs"
