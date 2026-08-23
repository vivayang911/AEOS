CREATE OR REPLACE FUNCTION validate_evidence_anchor_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1
    FROM attestcoin_proof_jobs j
    JOIN decisions d ON d.id=NEW.decision_id AND d.organization_id=j.organization_id
    JOIN evidence_snapshots s ON s.id=d.evidence_snapshot_id AND s.organization_id=d.organization_id
    JOIN evidence e ON e.id=j.evidence_id AND e.organization_id=j.organization_id
    WHERE j.id=NEW.attestcoin_proof_job_id
      AND j.organization_id=NEW.organization_id
      AND j.requester_wallet=NEW.requester_wallet
      AND j.status='VERIFIED'
      AND j.proof_snapshot IS NOT NULL
      AND j.verification_receipt IS NOT NULL
      AND d.evidence_snapshot_id=NEW.evidence_snapshot_id
      AND EXISTS(
        SELECT 1 FROM jsonb_array_elements(s.manifest) item
        WHERE item->>'evidenceId'=j.evidence_id AND item->>'contentHash'=e.content_hash
      )
  ) THEN
    RAISE EXCEPTION 'Evidence Anchor handoff Proof Job Evidence is not frozen in the Decision snapshot';
  END IF;
  RETURN NEW;
END $$;
