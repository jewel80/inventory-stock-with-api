#!/usr/bin/env pwsh
# =============================================================================
# Local deployment (Windows/PowerShell) — rebuild images from source and
# (re)create containers. Preserves the Postgres `pgdata` volume.
# `restart: unless-stopped` in docker-compose.yml auto-restarts crashed
# containers.
#
# Usage:
#   .\scripts\deploy.ps1                        # rebuild from current source
#   $env:IMAGE_OWNER='myname'; .\scripts\deploy.ps1   # pull prebuilt GHCR images
# =============================================================================
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

# Always run from the repo root (where docker-compose.yml lives).
Set-Location -Path (Join-Path $PSScriptRoot '..')

if ($env:IMAGE_OWNER) {
    $tag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { 'latest' }
    Write-Host "==> Pulling prebuilt images for owner '$env:IMAGE_OWNER' (tag=$tag)..."
    docker compose -f docker-compose.yml pull backend frontend
    if ($LASTEXITCODE -ne 0) { throw "docker compose pull failed" }
    docker compose -f docker-compose.yml up -d --remove-orphans
} else {
    Write-Host "==> Building images from source & (re)creating containers..."
    docker compose -f docker-compose.yml up -d --build --remove-orphans
}
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

Write-Host "==> Waiting for the backend to become healthy (up to 5 min)..."
$ok = $false
for ($i = 1; $i -le 60; $i++) {
    try {
        $null = Invoke-RestMethod -Uri 'http://localhost:8000/health' -TimeoutSec 3
        Write-Host "    Backend healthy after ~$($i * 5)s"
        $ok = $true
        break
    } catch {
        Start-Sleep -Seconds 5
    }
}

if (-not $ok) {
    Write-Error "Backend did not become healthy in time. Recent logs:"
    docker compose -f docker-compose.yml logs --tail=100 backend
    exit 1
}

Write-Host ""
Write-Host "==> Stack status:"
docker compose -f docker-compose.yml ps

Write-Host ""
Write-Host "✅ Deployed."
Write-Host "   Frontend : http://localhost:9000"
Write-Host "   API      : http://localhost:8000"
Write-Host "   Health   : http://localhost:8000/health"
