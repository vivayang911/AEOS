CREATE TABLE IF NOT EXISTS proposals (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  policy_version_id text NOT NULL REFERENCES policy_versions(id),
  evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
  simulation_id text NOT NULL REFERENCES policy_simulations(id),
  proposal_type text NOT NULL CHECK(proposal_type IN('TREASURY_ACTION')),
  state text NOT NULL CHECK(state IN('DRAFT','REVIEW','PUBLISHED','PENDING','ACTIVE','SUCCEEDED','DEFEATED','QUEUED','EXECUTED','EXPIRED')),
  title text NOT NULL,
  summary text NOT NULL,
  rationale text NOT NULL,
  action jsonb NOT NULL,
  targets jsonb NOT NULL,
  values_json jsonb NOT NULL,
  calldatas jsonb NOT NULL,
  calldata_hash text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,content_hash)
);
CREATE INDEX IF NOT EXISTS proposals_org_state_created_idx ON proposals(organization_id,state,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_proposal_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'proposal content is immutable; append a state transition or create a replacement'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS proposal_immutable ON proposals;
CREATE TRIGGER proposal_immutable BEFORE UPDATE OR DELETE ON proposals
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_mutation();
