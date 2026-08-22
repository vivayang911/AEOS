# Database backup and restore runbook

## Scope and authority

`npm run verify:database-restore` is a local logical-snapshot recovery drill. It reads the configured AEOS PostgreSQL database, writes a temporary custom-format dump inside the PostgreSQL container, restores into a random database whose name must match `aeos_restore_drill_[0-9a-f]{12}`, verifies it, and deletes both temporary resources in `finally`.

The drill never drops, recreates, migrates or writes to the source database. It has no wallet, signer, network-provider, governance or asset authority. It does not verify a production backup schedule, continuous WAL archive, PITR, encryption-at-rest, off-site retention or disaster infrastructure and must not be reported as those controls.

## Run

```powershell
docker compose -f infra/docker-compose.yml up -d postgres
$env:DATABASE_URL='postgresql://aeos:aeos@127.0.0.1:5432/aeos'
npm run verify:database-restore
```

Acceptance requires `status=PASS`, `sourceUnmodified=true`, `sourceWritesPerformed=false`, a SHA-256 backup hash, equal source/restored manifest hashes, and zero residual `aeos_restore_drill_*` databases. The manifest compares every public table's row count and deterministic row-content digest plus the complete migration list, RLS-enabled tables, policies and non-internal trigger definitions.

`measuredRtoSeconds` is only the measured local logical restore time for this dataset and host. `rpoClassification=CONSISTENT_LOGICAL_SNAPSHOT_ONLY`, `productionWalPitrVerified=false`, and `productionBackupScheduleVerified=false` are mandatory truth labels.

## Failure response

- Source manifests differ before and after backup: treat the drill as unstable and rerun during a controlled read-only window; do not compare against a moving source.
- Backup or hash failure: retain no success claim; inspect container disk, `pg_dump` version and permissions.
- Restore failure: keep the source untouched, inspect `pg_restore` output and migration dependencies, then rerun with a new temporary name.
- Manifest mismatch: classify as a failed recovery and compare the reported table, migration, RLS policy and trigger definitions before any release.
- Cleanup failure: manually inspect only databases matching the exact `aeos_restore_drill_[0-9a-f]{12}` pattern. Never use a broad database-name match and never target the configured source database.

## Production work still required

Configure encrypted daily full backups, continuous WAL archival/PITR, off-site retention and alerting in the selected production platform. Run a separately approved quarterly production-like restore into isolated infrastructure, record recovery point/time objectives and access evidence, and validate deletion/retention obligations. This local drill is a release regression foundation, not production disaster-recovery acceptance.
