CREATE OR REPLACE FUNCTION reject_evidence_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Evidence snapshots are immutable';
END $$;

DROP TRIGGER IF EXISTS evidence_snapshot_immutable ON evidence_snapshots;
CREATE TRIGGER evidence_snapshot_immutable BEFORE UPDATE OR DELETE ON evidence_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_evidence_snapshot_mutation();

CREATE OR REPLACE FUNCTION reject_snapshotted_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(
    SELECT 1 FROM evidence_snapshots snapshot,
      LATERAL jsonb_array_elements_text(snapshot.evidence_ids) frozen_evidence_id
    WHERE frozen_evidence_id=OLD.id
  ) THEN
    RAISE EXCEPTION 'Evidence frozen by an Evidence snapshot is immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS snapshotted_evidence_immutable ON evidence;
CREATE TRIGGER snapshotted_evidence_immutable BEFORE UPDATE OR DELETE ON evidence
FOR EACH ROW EXECUTE FUNCTION reject_snapshotted_evidence_mutation();

CREATE OR REPLACE FUNCTION reject_snapshotted_raw_attestation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM evidence linked_evidence
    JOIN evidence_snapshots snapshot ON EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(snapshot.evidence_ids) frozen_evidence_id
      WHERE frozen_evidence_id=linked_evidence.id
    )
    WHERE linked_evidence.raw_attestation_id=OLD.id
  ) THEN
    RAISE EXCEPTION 'Raw attestation referenced by frozen Evidence is immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS snapshotted_raw_attestation_immutable ON raw_attestations;
CREATE TRIGGER snapshotted_raw_attestation_immutable BEFORE UPDATE OR DELETE ON raw_attestations
FOR EACH ROW EXECUTE FUNCTION reject_snapshotted_raw_attestation_mutation();
