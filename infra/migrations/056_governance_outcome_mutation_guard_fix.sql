CREATE OR REPLACE FUNCTION reject_linked_governance_outcome_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM governance_outcome_evidence WHERE evidence_id=OLD.id) THEN
    RAISE EXCEPTION 'Evidence referenced by governance Outcome Evidence is immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION reject_linked_governance_outcome_raw_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(
    SELECT 1 FROM evidence e JOIN governance_outcome_evidence o ON o.evidence_id=e.id
    WHERE e.raw_attestation_id=OLD.id
  ) THEN RAISE EXCEPTION 'Raw attestation referenced by governance Outcome Evidence is immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
