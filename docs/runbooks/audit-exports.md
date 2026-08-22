# Immutable audit exports

## Purpose and boundary

AEOS audit exports are tenant-scoped JSON snapshots for review and evidence handoff. They are not signing artifacts and grant no governance, transaction, broadcast, or asset authority. Only an authenticated ADMIN or AUDITOR in the selected organization may create or read them.

Each `audit.export.v1` manifest contains normalized filters, deterministic `occurred_at ASC, id ASC` ordering, complete selected audit-event snapshots, source payload hashes, schema versions and request IDs. The manifest hash is SHA-256 over canonical JSON. Creation appends `audit.export_created`; repeated creation of an identical filtered event set reuses the existing immutable export and does not append another creation event.

## Size and filtering

A single export is limited to 1000 events. AEOS refuses larger results instead of silently truncating them. Narrow the request using `eventType`, `from`, or `to`; preserve all returned export IDs and hashes when producing a multi-package handoff.

## Verification

1. Read the package with `GET /api/v1/audit-exports/{id}`.
2. Call `GET /api/v1/audit-exports/{id}/verify`.
3. Require both `storedManifestValid=true` and `sourceEventsMatch=true`.
4. Treat `verified=false`, a missing source event, or a hash mismatch as an integrity incident; do not modify database rows.
5. Correlate events through `requestId`, `objectRef`, `payloadHash`, and their source Outbox envelopes.

The database rejects UPDATE and DELETE on export records. Cross-organization reads are hidden by RLS. Large-payload object storage and externally signed export archives remain future deployment work.

## Explorer links

`GET /api/v1/audit-events/{id}/explorer-links` derives transaction, address and block links without calling the Explorer. The HTTPS base URL and chain ID come only from the latest immutable organization configuration. The event must carry the same explicit `chainId`; missing or mismatched identity produces no links. Only fixed field names and strict transaction-hash, address, block-number or block-hash formats are accepted. URLs and lookalike hash fields contained in event data are ignored.

Explorer links are a derived convenience view and are not included in immutable export hashes, so a later organization configuration version cannot rewrite an existing export package.
