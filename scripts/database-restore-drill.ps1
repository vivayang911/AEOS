$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

$sourceUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { 'postgresql://aeos:aeos@127.0.0.1:5432/aeos' }
$source = [System.Uri]$sourceUrl
if ($source.Scheme -notin @('postgres','postgresql')) { throw 'DATABASE_URL must be PostgreSQL' }
$sourceDatabase = $source.AbsolutePath.TrimStart('/')
if ($sourceDatabase -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'DATABASE_URL database name is invalid' }
$databaseUser = ($source.UserInfo -split ':',2)[0]
if ($databaseUser -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'DATABASE_URL user is invalid' }
$container = (docker compose -f infra/docker-compose.yml ps -q postgres).Trim()
if (-not $container) { throw 'AEOS PostgreSQL container is not running' }

$suffix = [Guid]::NewGuid().ToString('N').Substring(0,12)
$restoreDatabase = "aeos_restore_drill_$suffix"
if ($restoreDatabase -notmatch '^aeos_restore_drill_[0-9a-f]{12}$') { throw 'Unsafe restore database name' }
$backupPath = "/tmp/$restoreDatabase.dump"
$restoreUrlBuilder = [System.UriBuilder]$sourceUrl
$restoreUrlBuilder.Path = "/$restoreDatabase"
$restoreUrl = $restoreUrlBuilder.Uri.AbsoluteUri
$startedAt = [DateTimeOffset]::UtcNow
$restoreCreated = $false

try {
  $env:DATABASE_RESTORE_MANIFEST_URL = $sourceUrl
  $before = (node apps/api/scripts/database-restore-manifest.cjs | ConvertFrom-Json)
  docker exec $container pg_dump --username=$databaseUser --dbname=$sourceDatabase --format=custom --compress=6 --no-owner --no-privileges --file=$backupPath
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL logical backup failed' }
  $backupHash = ((docker exec $container sha256sum $backupPath) -split '\s+')[0]
  if ($LASTEXITCODE -ne 0 -or $backupHash -notmatch '^[0-9a-f]{64}$') { throw 'Backup hash verification failed' }
  $after = (node apps/api/scripts/database-restore-manifest.cjs | ConvertFrom-Json)
  if ($before.manifestHash -ne $after.manifestHash) { throw 'Source database changed during drill; refusing an unstable restore comparison' }

  docker exec $container createdb --username=$databaseUser --template=template0 $restoreDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Isolated restore database creation failed' }
  $restoreCreated = $true
  docker exec $container pg_restore --username=$databaseUser --dbname=$restoreDatabase --no-owner --no-privileges --exit-on-error $backupPath
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL restore failed' }
  $env:DATABASE_RESTORE_MANIFEST_URL = $restoreUrl
  $restored = (node apps/api/scripts/database-restore-manifest.cjs | ConvertFrom-Json)
  if ($after.manifestHash -ne $restored.manifestHash) { throw 'Restored database manifest does not match the source snapshot' }

  $finishedAt = [DateTimeOffset]::UtcNow
  [pscustomobject]@{
    schemaVersion = 'aeos.database-restore-drill.v1'
    status = 'PASS'
    sourceDatabase = $sourceDatabase
    isolatedRestoreDatabase = $restoreDatabase
    sourceUnmodified = $true
    backupSha256 = $backupHash
    manifestHash = $restored.manifestHash
    migrations = $restored.migrations.Count
    tables = $restored.tables.Count
    rlsTables = $restored.rlsTables.Count
    policies = $restored.policies.Count
    immutableAndDomainTriggers = $restored.triggers.Count
    measuredRtoSeconds = [Math]::Round(($finishedAt - $startedAt).TotalSeconds,3)
    rpoClassification = 'CONSISTENT_LOGICAL_SNAPSHOT_ONLY'
    productionWalPitrVerified = $false
    productionBackupScheduleVerified = $false
    sourceWritesPerformed = $false
    assetExecutionAuthorized = $false
  } | ConvertTo-Json -Compress
} finally {
  Remove-Item Env:DATABASE_RESTORE_MANIFEST_URL -ErrorAction SilentlyContinue
  if ($restoreCreated -and $restoreDatabase -match '^aeos_restore_drill_[0-9a-f]{12}$') {
    docker exec $container dropdb --username=$databaseUser --force --if-exists $restoreDatabase | Out-Null
  }
  docker exec $container rm -f $backupPath | Out-Null
}
