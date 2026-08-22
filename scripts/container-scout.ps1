$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
if ($env:ALLOW_DOCKER_SCOUT_METADATA_UPLOAD -ne 'I_UNDERSTAND_AND_APPROVE') { throw 'Explicit Docker Scout metadata-upload approval is required' }
$image = if ($env:AEOS_API_IMAGE) { $env:AEOS_API_IMAGE } else { 'aeos-api:local-security-gate' }
$reportDirectory = Join-Path $PSScriptRoot '..\reports\security'
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$sarifPath = Join-Path $reportDirectory 'docker-scout.sarif.json'
docker scout cves --format sarif --output $sarifPath --only-severity critical,high --exit-code "local://$image"
$scanExitCode = $LASTEXITCODE
if (-not (Test-Path $sarifPath)) { throw 'Docker Scout did not produce a report' }
$sarif = Get-Content -Raw -Path $sarifPath | ConvertFrom-Json
if (-not $sarif.runs) { throw 'Docker Scout report is invalid' }
if ($scanExitCode -eq 2) { throw 'high or critical container vulnerability detected' }
if ($scanExitCode -ne 0) { throw 'Docker Scout scan failed' }
Write-Output ([pscustomobject]@{status='PASS';image=$image;criticalHigh=0;report=$sarifPath;metadataDisclosureExplicitlyApproved=$true} | ConvertTo-Json -Compress)
