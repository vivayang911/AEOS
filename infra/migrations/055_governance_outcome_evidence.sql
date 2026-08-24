CREATE TABLE governance_outcome_evidence (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  evidence_id text NOT NULL REFERENCES evidence(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
  source_evidence_ids jsonb NOT NULL,
  external_proposal_id text NOT NULL,
  chain_id integer NOT NULL,
  transaction_hash text NOT NULL CHECK(transaction_hash~'^0x[0-9a-f]{64}$'),
  block_number bigint NOT NULL CHECK(block_number>=0),
  block_hash text NOT NULL CHECK(block_hash~'^0x[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  content_hash text NOT NULL CHECK(content_hash~'^0x[0-9a-f]{64}$'),
  asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,transaction_hash),
  UNIQUE(organization_id,content_hash),
  UNIQUE(evidence_id)
);

CREATE INDEX governance_outcome_evidence_org_decision_idx
  ON governance_outcome_evidence(organization_id,decision_id,created_at DESC);

CREATE OR REPLACE FUNCTION validate_governance_outcome_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d decisions%ROWTYPE; s evidence_snapshots%ROWTYPE; e evidence%ROWTYPE;
BEGIN
  SELECT * INTO d FROM decisions WHERE id=NEW.decision_id;
  SELECT * INTO s FROM evidence_snapshots WHERE id=NEW.evidence_snapshot_id;
  SELECT * INTO e FROM evidence WHERE id=NEW.evidence_id;
  IF d.id IS NULL OR s.id IS NULL OR e.id IS NULL OR
     d.organization_id IS DISTINCT FROM NEW.organization_id OR
     s.organization_id IS DISTINCT FROM NEW.organization_id OR
     e.organization_id IS DISTINCT FROM NEW.organization_id OR
     d.evidence_snapshot_id IS DISTINCT FROM NEW.evidence_snapshot_id THEN
    RAISE EXCEPTION 'governance outcome tenant or Decision/Snapshot lineage mismatch';
  END IF;
  IF jsonb_typeof(NEW.source_evidence_ids)<>'array' OR jsonb_array_length(NEW.source_evidence_ids)=0 OR
     EXISTS(
       SELECT 1 FROM jsonb_array_elements_text(NEW.source_evidence_ids) source_id
       WHERE NOT EXISTS(
         SELECT 1 FROM evidence source_evidence
         WHERE source_evidence.id=source_id AND source_evidence.organization_id=NEW.organization_id
           AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(s.evidence_ids) snapshot_id WHERE snapshot_id=source_id)
       )
     ) THEN
    RAISE EXCEPTION 'governance outcome source Evidence is not frozen in the Decision snapshot';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER governance_outcome_lineage_guard BEFORE INSERT ON governance_outcome_evidence
FOR EACH ROW EXECUTE FUNCTION validate_governance_outcome_evidence();

CREATE OR REPLACE FUNCTION reject_governance_outcome_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'governance Outcome Evidence lineage is immutable'; END $$;
CREATE TRIGGER governance_outcome_evidence_immutable BEFORE UPDATE OR DELETE ON governance_outcome_evidence
FOR EACH ROW EXECUTE FUNCTION reject_governance_outcome_evidence_mutation();

CREATE OR REPLACE FUNCTION reject_linked_governance_outcome_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM governance_outcome_evidence WHERE evidence_id=OLD.id) THEN
    RAISE EXCEPTION 'Evidence referenced by governance Outcome Evidence is immutable';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER linked_governance_outcome_evidence_immutable BEFORE UPDATE OR DELETE ON evidence
FOR EACH ROW EXECUTE FUNCTION reject_linked_governance_outcome_evidence_mutation();

CREATE OR REPLACE FUNCTION reject_linked_governance_outcome_raw_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(
    SELECT 1 FROM evidence e JOIN governance_outcome_evidence o ON o.evidence_id=e.id
    WHERE e.raw_attestation_id=OLD.id
  ) THEN RAISE EXCEPTION 'Raw attestation referenced by governance Outcome Evidence is immutable'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER linked_governance_outcome_raw_immutable BEFORE UPDATE OR DELETE ON raw_attestations
FOR EACH ROW EXECUTE FUNCTION reject_linked_governance_outcome_raw_mutation();

ALTER TABLE governance_outcome_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON governance_outcome_evidence
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON governance_outcome_evidence TO aeos_app;
