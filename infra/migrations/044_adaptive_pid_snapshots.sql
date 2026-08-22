CREATE TABLE adaptive_pid_snapshots (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  treasury_id text NOT NULL,
  policy_version_id text NOT NULL REFERENCES policy_versions(id),
  evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
  decision_id text REFERENCES decisions(id),
  rag_manifest_hashes text[] NOT NULL DEFAULT '{}',
  skill_version_refs text[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK(status IN('ADVISORY','HOLD')),
  input jsonb NOT NULL,
  input_hash text NOT NULL CHECK(input_hash~'^0x[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  result_hash text NOT NULL CHECK(result_hash~'^0x[0-9a-f]{64}$'),
  created_by text NOT NULL,
  advisory_only boolean NOT NULL DEFAULT true CHECK(advisory_only=true),
  asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,policy_version_id,input_hash)
);
CREATE INDEX adaptive_pid_snapshots_org_treasury_created_idx ON adaptive_pid_snapshots(organization_id,treasury_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_adaptive_pid_snapshot_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'adaptive PID snapshots are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER adaptive_pid_snapshot_immutable BEFORE UPDATE OR DELETE ON adaptive_pid_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_adaptive_pid_snapshot_mutation();

ALTER TABLE adaptive_pid_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON adaptive_pid_snapshots
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON adaptive_pid_snapshots TO aeos_app;
