CREATE TABLE IF NOT EXISTS evidence_anchor_handoffs (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  attestcoin_proof_job_id text NOT NULL REFERENCES attestcoin_proof_jobs(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
  requester_wallet text NOT NULL CHECK(requester_wallet ~ '^0x[0-9a-f]{40}$'),
  asc_address text NOT NULL CHECK(asc_address ~ '^0x[0-9a-f]{40}$'),
  commitment_id text NOT NULL CHECK(commitment_id ~ '^0x[0-9a-f]{64}$'),
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL CHECK(manifest_hash ~ '^0x[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,attestcoin_proof_job_id,decision_id),
  UNIQUE(organization_id,commitment_id)
);

CREATE INDEX IF NOT EXISTS evidence_anchor_handoffs_org_created_idx ON evidence_anchor_handoffs(organization_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION validate_evidence_anchor_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM attestcoin_proof_jobs j WHERE j.id=NEW.attestcoin_proof_job_id AND j.organization_id=NEW.organization_id AND j.requester_wallet=NEW.requester_wallet AND j.proof_snapshot IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM decisions d WHERE d.id=NEW.decision_id AND d.organization_id=NEW.organization_id AND d.evidence_snapshot_id=NEW.evidence_snapshot_id)
  THEN RAISE EXCEPTION 'Evidence Anchor handoff tenant, requester, proof, or Decision snapshot mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evidence_anchor_handoff_guard BEFORE INSERT ON evidence_anchor_handoffs FOR EACH ROW EXECUTE FUNCTION validate_evidence_anchor_handoff();

CREATE OR REPLACE FUNCTION evidence_anchor_handoff_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Evidence Anchor handoffs are immutable'; END $$;
CREATE TRIGGER evidence_anchor_handoff_no_update BEFORE UPDATE OR DELETE ON evidence_anchor_handoffs FOR EACH ROW EXECUTE FUNCTION evidence_anchor_handoff_immutable();

ALTER TABLE evidence_anchor_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON evidence_anchor_handoffs USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON evidence_anchor_handoffs TO aeos_app;
