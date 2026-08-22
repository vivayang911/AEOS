-- Phase 1 acceptance constraints separated so already-migrated prototype databases advance safely.
ALTER TABLE raw_attestations ADD COLUMN IF NOT EXISTS verification_error text;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS freshness_expires_at timestamptz;
UPDATE evidence SET freshness_expires_at=observed_at + interval '1 hour' WHERE freshness_expires_at IS NULL;
ALTER TABLE evidence ALTER COLUMN freshness_expires_at SET NOT NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS quality_components jsonb;
UPDATE evidence SET quality_components=jsonb_build_object('proofStrength',35,'sourceReliability',20,'freshness',20,'completeness',15,'consistency',10) WHERE quality_components IS NULL;
ALTER TABLE evidence ALTER COLUMN quality_components SET NOT NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS conflict_group_id text;
ALTER TABLE evidence_snapshots ADD COLUMN IF NOT EXISTS manifest jsonb;
UPDATE evidence_snapshots SET manifest='[]'::jsonb WHERE manifest IS NULL;
ALTER TABLE evidence_snapshots ALTER COLUMN manifest SET NOT NULL;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor jsonb;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS data jsonb;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS schema_version text DEFAULT '1.0';
CREATE INDEX IF NOT EXISTS evidence_org_verification_idx ON evidence(organization_id,verification_status,freshness_expires_at);
CREATE INDEX IF NOT EXISTS evidence_snapshot_org_manifest_idx ON evidence_snapshots(organization_id,manifest_hash);
