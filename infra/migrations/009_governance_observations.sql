CREATE TABLE IF NOT EXISTS proposal_state_observations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  proposal_id text NOT NULL REFERENCES proposals(id),
  previous_observation_id text REFERENCES proposal_state_observations(id),
  adapter text NOT NULL,
  state text NOT NULL CHECK(state IN('REVIEW','PUBLISHED','PENDING','ACTIVE','SUCCEEDED','DEFEATED','QUEUED','EXECUTED','EXPIRED')),
  chain_id integer NOT NULL,
  governor text NOT NULL,
  external_proposal_id text NOT NULL,
  block_number bigint NOT NULL CHECK(block_number>=0),
  block_hash text NOT NULL,
  confirmations integer NOT NULL CHECK(confirmations BETWEEN 0 AND 10000),
  is_reorg boolean NOT NULL DEFAULT false,
  reorg_of_observation_id text REFERENCES proposal_state_observations(id),
  observed_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,proposal_id,payload_hash)
);
CREATE INDEX IF NOT EXISTS proposal_observations_org_proposal_idx ON proposal_state_observations(organization_id,proposal_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_proposal_observation_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'governance observations are append-only'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS proposal_observation_immutable ON proposal_state_observations;
CREATE TRIGGER proposal_observation_immutable BEFORE UPDATE OR DELETE ON proposal_state_observations
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_observation_mutation();
