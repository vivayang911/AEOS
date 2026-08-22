CREATE TABLE IF NOT EXISTS execution_reconciliation_attempts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  preflight_id text NOT NULL REFERENCES execution_preflights(id),
  proposal_id text NOT NULL REFERENCES proposals(id),
  ordinal integer NOT NULL CHECK(ordinal > 0),
  safe_tx_hash text NOT NULL,
  adapter text NOT NULL,
  outcome text NOT NULL CHECK(outcome IN('SUCCEEDED','FAILED_RETRYABLE','FAILED_TERMINAL','REJECTED')),
  error_code text,
  retry_after_seconds integer NOT NULL CHECK(retry_after_seconds >= 0),
  observation_id text REFERENCES safe_transaction_observations(id),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  attempted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,preflight_id,ordinal)
);
CREATE INDEX IF NOT EXISTS execution_reconciliation_attempts_org_preflight_idx ON execution_reconciliation_attempts(organization_id,preflight_id,ordinal);

CREATE OR REPLACE FUNCTION prevent_execution_reconciliation_attempt_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'execution reconciliation attempts are immutable'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS execution_reconciliation_attempt_immutable ON execution_reconciliation_attempts;
CREATE TRIGGER execution_reconciliation_attempt_immutable BEFORE UPDATE OR DELETE ON execution_reconciliation_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_execution_reconciliation_attempt_mutation();
