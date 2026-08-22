$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$image = if ($env:AEOS_API_IMAGE) { $env:AEOS_API_IMAGE } else { 'aeos-api:local-security-gate' }
$reportDirectory = Join-Path $PSScriptRoot '..\reports\security'
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null

docker build --pull --file apps/api/Dockerfile --tag $image .
if ($LASTEXITCODE -ne 0) { throw 'API container build failed' }
$user = docker image inspect $image --format '{{.Config.User}}'
if ($LASTEXITCODE -ne 0 -or $user -eq '' -or $user -eq '0' -or $user -eq 'root') { throw 'container must use a non-root user' }
$health = docker image inspect $image --format '{{json .Config.Healthcheck}}'
if ($LASTEXITCODE -ne 0 -or -not $health -or $health -eq 'null') { throw 'container healthcheck is missing' }

Write-Output ([pscustomobject]@{status='LOCAL_BUILD_VERIFIED';image=$image;user=$user;healthcheck=$true;externalCveScan='NOT_AUTHORIZED';imageMetadataUploaded=$false} | ConvertTo-Json -Compress)
