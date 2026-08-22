CREATE TABLE IF NOT EXISTS safe_transaction_observations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  preflight_id text NOT NULL REFERENCES execution_preflights(id),
  proposal_id text NOT NULL REFERENCES proposals(id),
  ordinal integer NOT NULL CHECK(ordinal > 0),
  previous_observation_id text REFERENCES safe_transaction_observations(id),
  adapter text NOT NULL,
  safe_address text NOT NULL,
  safe_tx_hash text NOT NULL,
  state text NOT NULL CHECK(state IN('PENDING_SIGNATURES','READY_TO_EXECUTE','EXECUTED','FAILED')),
  confirmations integer NOT NULL CHECK(confirmations >= 0),
  confirmations_required integer NOT NULL CHECK(confirmations_required > 0),
  execution_tx_hash text,
  execution_block_number bigint,
  execution_block_hash text,
  onchain_execution_confirmed boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,preflight_id,ordinal),
  UNIQUE(organization_id,preflight_id,payload_hash)
);
CREATE INDEX IF NOT EXISTS safe_transaction_observations_org_preflight_idx ON safe_transaction_observations(organization_id,preflight_id,ordinal);

CREATE OR REPLACE FUNCTION prevent_safe_transaction_observation_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'safe transaction observations are immutable'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS safe_transaction_observation_immutable ON safe_transaction_observations;
CREATE TRIGGER safe_transaction_observation_immutable BEFORE UPDATE OR DELETE ON safe_transaction_observations
FOR EACH ROW EXECUTE FUNCTION prevent_safe_transaction_observation_mutation();
