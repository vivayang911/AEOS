CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS raw_attestations (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
  provider text NOT NULL, chain_id integer NOT NULL, payload jsonb NOT NULL,
  content_hash text NOT NULL, verification_error text,
  received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id, content_hash)
);
CREATE TABLE IF NOT EXISTS evidence (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
  raw_attestation_id text NOT NULL REFERENCES raw_attestations(id), subject jsonb NOT NULL,
  predicate text NOT NULL, value jsonb NOT NULL, chain jsonb NOT NULL, source jsonb NOT NULL,
  verification_status text NOT NULL CHECK(verification_status IN('VERIFIED','REJECTED','UNVERIFIED')),
  freshness_status text NOT NULL CHECK(freshness_status IN('FRESH','STALE','ARCHIVED')),
  freshness_expires_at timestamptz NOT NULL, quality_score integer NOT NULL CHECK(quality_score BETWEEN 0 AND 100),
  quality_components jsonb NOT NULL, conflict_group_id text, observed_at timestamptz NOT NULL,
  content_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, content_hash)
);
CREATE INDEX IF NOT EXISTS evidence_org_predicate_observed_idx ON evidence(organization_id,predicate,observed_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS evidence_quarantine (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
  raw_attestation_id text NOT NULL REFERENCES raw_attestations(id), reason_code text NOT NULL,
  details jsonb NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), evidence_ids jsonb NOT NULL,
  manifest jsonb NOT NULL, manifest_hash text NOT NULL, query jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,manifest_hash)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), event_type text NOT NULL,
  actor jsonb NOT NULL, object_type text NOT NULL, object_id text NOT NULL, data jsonb NOT NULL,
  payload_hash text NOT NULL, schema_version text NOT NULL DEFAULT '1.0', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_org_created_idx ON audit_events(organization_id,created_at DESC,id DESC);

-- Forward-compatible upgrades for databases created by the pre-migration prototype.
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
