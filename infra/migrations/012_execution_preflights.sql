CREATE TABLE IF NOT EXISTS execution_preflights (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  proposal_id text NOT NULL REFERENCES proposals(id),
  policy_version_id text NOT NULL REFERENCES policy_versions(id),
  evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
  governance_observation_id text REFERENCES proposal_state_observations(id),
  status text NOT NULL CHECK(status IN('READY_FOR_SAFE_REVIEW','BLOCKED')),
  action_id text NOT NULL,
  input jsonb NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  result_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS execution_preflights_org_proposal_idx ON execution_preflights(organization_id,proposal_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_execution_preflight_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'execution preflights are immutable'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS execution_preflight_immutable ON execution_preflights;
CREATE TRIGGER execution_preflight_immutable BEFORE UPDATE OR DELETE ON execution_preflights
FOR EACH ROW EXECUTE FUNCTION prevent_execution_preflight_mutation();
