CREATE TABLE IF NOT EXISTS attestcoin_proof_jobs (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  adapter text NOT NULL,
  source_chain_id integer NOT NULL CHECK(source_chain_id=11155111),
  source_chain_key integer NOT NULL CHECK(source_chain_key=1),
  source_tx_hash text NOT NULL,
  requester_wallet text NOT NULL,
  status text NOT NULL CHECK(status IN('RECEIPT_VERIFIED','ATTESTATION_PENDING','PROOF_READY','VERIFICATION_PREPARED','VERIFIED','REJECTED')),
  source_snapshot jsonb NOT NULL,
  source_snapshot_hash text NOT NULL,
  proof_snapshot jsonb,
  proof_snapshot_hash text,
  verification_request jsonb,
  verification_request_hash text,
  verification_receipt jsonb,
  verification_receipt_hash text,
  verification_tx_hash text,
  evidence_id text REFERENCES evidence(id),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,source_chain_id,source_tx_hash),
  CHECK((proof_snapshot IS NULL)=(proof_snapshot_hash IS NULL)),
  CHECK((verification_request IS NULL)=(verification_request_hash IS NULL)),
  CHECK((verification_receipt IS NULL)=(verification_receipt_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS attestcoin_jobs_org_created_idx ON attestcoin_proof_jobs(organization_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_attestcoin_snapshot_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.source_chain_id IS DISTINCT FROM OLD.source_chain_id
    OR NEW.source_chain_key IS DISTINCT FROM OLD.source_chain_key
    OR NEW.source_tx_hash IS DISTINCT FROM OLD.source_tx_hash
    OR NEW.requester_wallet IS DISTINCT FROM OLD.requester_wallet
    OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
    OR NEW.source_snapshot_hash IS DISTINCT FROM OLD.source_snapshot_hash
    OR (OLD.proof_snapshot IS NOT NULL AND NEW.proof_snapshot IS DISTINCT FROM OLD.proof_snapshot)
    OR (OLD.proof_snapshot_hash IS NOT NULL AND NEW.proof_snapshot_hash IS DISTINCT FROM OLD.proof_snapshot_hash)
    OR (OLD.verification_request IS NOT NULL AND NEW.verification_request IS DISTINCT FROM OLD.verification_request)
    OR (OLD.verification_request_hash IS NOT NULL AND NEW.verification_request_hash IS DISTINCT FROM OLD.verification_request_hash)
    OR (OLD.verification_receipt IS NOT NULL AND NEW.verification_receipt IS DISTINCT FROM OLD.verification_receipt)
    OR (OLD.verification_receipt_hash IS NOT NULL AND NEW.verification_receipt_hash IS DISTINCT FROM OLD.verification_receipt_hash)
  THEN RAISE EXCEPTION 'attestcoin proof snapshots are immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS attestcoin_snapshot_immutable ON attestcoin_proof_jobs;
CREATE TRIGGER attestcoin_snapshot_immutable BEFORE UPDATE ON attestcoin_proof_jobs
FOR EACH ROW EXECUTE FUNCTION prevent_attestcoin_snapshot_mutation();
