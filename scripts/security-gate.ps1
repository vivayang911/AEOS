$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
npm.cmd run build -w @aeos/api
if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
npm.cmd run security:secrets
if ($LASTEXITCODE -ne 0) { throw 'secret scan failed' }

$reportDirectory = Join-Path $PSScriptRoot '..\reports\security'
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$auditPath = Join-Path $reportDirectory 'npm-audit.json'
npm.cmd audit --json | Set-Content -Encoding utf8 -Path $auditPath
$auditExitCode = $LASTEXITCODE
$audit = Get-Content -Raw -Path $auditPath | ConvertFrom-Json
if (-not $audit.metadata -or -not $audit.metadata.vulnerabilities) { throw 'npm audit did not return a valid advisory report' }
if ($audit.metadata.vulnerabilities.critical -gt 0 -or $audit.metadata.vulnerabilities.high -gt 0) { throw 'high or critical dependency vulnerability detected' }
if ($auditExitCode -ne 0 -and $audit.metadata.vulnerabilities.total -eq 0) { throw 'npm audit failed without a valid vulnerability result' }
Write-Output ([pscustomobject]@{status='PASS';critical=$audit.metadata.vulnerabilities.critical;high=$audit.metadata.vulnerabilities.high;moderate=$audit.metadata.vulnerabilities.moderate;low=$audit.metadata.vulnerabilities.low;report=$auditPath} | ConvertTo-Json -Compress)
