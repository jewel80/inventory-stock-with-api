#!/usr/bin/env pwsh
# =============================================================================
# Roll back (Windows/PowerShell) to a previously CI-built image tag
# (a git SHA pushed to GHCR).
#
# Usage:
#   .\scripts\rollback.ps1 <github-owner-or-org> <git-sha-or-tag>
# Example:
#   .\scripts\rollback.ps1 myuser 4cc833c
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string] $Owner,
    [Parameter(Mandatory = $true, Position = 1)][string] $Tag
)
$ErrorActionPreference = 'Stop'

Set-Location -Path (Join-Path $PSScriptRoot '..')

Write-Host "==> Rolling back to ghcr.io/$Owner/inventory-{backend,frontend}:$Tag"
$env:IMAGE_OWNER = $Owner
$env:IMAGE_TAG   = $Tag

Write-Host "==> Pulling rollback images..."
docker compose -f docker-compose.yml pull backend frontend
if ($LASTEXITCODE -ne 0) { throw "docker compose pull failed" }

Write-Host "==> Recreating containers on rollback images (pgdata preserved)..."
docker compose -f docker-compose.yml up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

Write-Host "==> Waiting for the backend to become healthy..."
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
    Write-Error "Backend did not become healthy after rollback. Logs:"
    docker compose -f docker-compose.yml logs --tail=100 backend
    exit 1
}

Write-Host ""
Write-Host "✅ Rolled back to $Tag"
Write-Host "   (If this is wrong, re-run deploy.ps1 to return to the latest source build.)"
