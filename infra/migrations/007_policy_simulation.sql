ALTER TABLE policy_versions ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Default Treasury Policy';
ALTER TABLE policy_versions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE policy_versions ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT 'treasury.policy.v1';
ALTER TABLE policy_versions ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE policy_versions ADD COLUMN IF NOT EXISTS activated_by text;
ALTER TABLE policy_versions ADD CONSTRAINT policy_versions_status_check CHECK(status IN('DRAFT','ACTIVE','RETIRED')) NOT VALID;
ALTER TABLE policy_versions VALIDATE CONSTRAINT policy_versions_status_check;
CREATE UNIQUE INDEX IF NOT EXISTS policy_versions_one_active_per_org ON policy_versions(organization_id) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS policy_versions_org_version_idx ON policy_versions(organization_id,version DESC);

CREATE TABLE IF NOT EXISTS policy_simulations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  policy_version_id text NOT NULL REFERENCES policy_versions(id),
  evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
  status text NOT NULL CHECK(status IN('SUGGESTED','BLOCKED')),
  input jsonb NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  result_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,policy_version_id,input_hash)
);
CREATE INDEX IF NOT EXISTS policy_simulations_org_created_idx ON policy_simulations(organization_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_policy_content_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.config IS DISTINCT FROM OLD.config
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.name IS DISTINCT FROM OLD.name
  THEN RAISE EXCEPTION 'policy version content is immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS policy_version_content_immutable ON policy_versions;
CREATE TRIGGER policy_version_content_immutable BEFORE UPDATE ON policy_versions
FOR EACH ROW EXECUTE FUNCTION prevent_policy_content_mutation();

CREATE OR REPLACE FUNCTION prevent_policy_simulation_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'policy simulations are immutable'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS policy_simulation_immutable ON policy_simulations;
CREATE TRIGGER policy_simulation_immutable BEFORE UPDATE OR DELETE ON policy_simulations
FOR EACH ROW EXECUTE FUNCTION prevent_policy_simulation_mutation();
