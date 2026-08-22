CREATE TABLE outcome_memory_retirements(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id),
 candidate_id text NOT NULL REFERENCES outcome_memory_candidates(id),
 promotion_id text NOT NULL REFERENCES outcome_memory_promotions(id),
 memory_id text NOT NULL REFERENCES organization_memories(id),
 retirement_type text NOT NULL CHECK(retirement_type IN('EXPIRED','SUPERSEDED')),
 replacement_candidate_id text REFERENCES outcome_memory_candidates(id),
 replacement_promotion_id text REFERENCES outcome_memory_promotions(id),
 replacement_memory_id text REFERENCES organization_memories(id),
 memory_event_id text NOT NULL REFERENCES memory_events(id),
 basis jsonb NOT NULL,
 content_hash text NOT NULL CHECK(content_hash~'^0x[0-9a-f]{64}$'),
 retired_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,candidate_id),
 UNIQUE(organization_id,memory_id),
 CHECK(
  (retirement_type='EXPIRED' AND replacement_candidate_id IS NULL AND replacement_promotion_id IS NULL AND replacement_memory_id IS NULL)
  OR
  (retirement_type='SUPERSEDED' AND replacement_candidate_id IS NOT NULL AND replacement_promotion_id IS NOT NULL AND replacement_memory_id IS NOT NULL)
 )
);
CREATE INDEX outcome_memory_retirements_org_created_idx ON outcome_memory_retirements(organization_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION validate_outcome_memory_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_treasury text; replacement_treasury text; latest_status text; replacement_status text; old_valid_until timestamptz;
BEGIN
 SELECT o.treasury_id,m.valid_until INTO old_treasury,old_valid_until
 FROM outcome_memory_candidates c
 JOIN outcome_memory_promotions p ON p.organization_id=c.organization_id AND p.candidate_id=c.id
 JOIN organization_memories m ON m.organization_id=c.organization_id AND m.id=p.memory_id
 JOIN treasury_outcome_assessments o ON o.organization_id=c.organization_id AND o.id=c.treasury_outcome_id
 WHERE c.organization_id=NEW.organization_id AND c.id=NEW.candidate_id AND p.id=NEW.promotion_id AND m.id=NEW.memory_id;
 IF old_treasury IS NULL THEN RAISE EXCEPTION 'outcome memory retirement lineage mismatch'; END IF;
 SELECT status INTO latest_status FROM memory_events WHERE organization_id=NEW.organization_id AND memory_id=NEW.memory_id ORDER BY ordinal DESC LIMIT 1;
 IF latest_status<>NEW.retirement_type THEN RAISE EXCEPTION 'outcome memory retirement event mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM memory_events WHERE organization_id=NEW.organization_id AND memory_id=NEW.memory_id AND id=NEW.memory_event_id AND status=NEW.retirement_type) THEN RAISE EXCEPTION 'outcome memory retirement event lineage mismatch'; END IF;
 IF NEW.retirement_type='EXPIRED' AND (old_valid_until IS NULL OR old_valid_until>now()) THEN RAISE EXCEPTION 'outcome memory is not expired'; END IF;
 IF NEW.retirement_type='SUPERSEDED' THEN
  IF NEW.replacement_candidate_id=NEW.candidate_id OR NEW.replacement_memory_id=NEW.memory_id THEN RAISE EXCEPTION 'outcome memory cannot supersede itself'; END IF;
  SELECT o.treasury_id INTO replacement_treasury
  FROM outcome_memory_candidates c
  JOIN outcome_memory_promotions p ON p.organization_id=c.organization_id AND p.candidate_id=c.id
  JOIN organization_memories m ON m.organization_id=c.organization_id AND m.id=p.memory_id
  JOIN treasury_outcome_assessments o ON o.organization_id=c.organization_id AND o.id=c.treasury_outcome_id
  WHERE c.organization_id=NEW.organization_id AND c.id=NEW.replacement_candidate_id AND p.id=NEW.replacement_promotion_id AND m.id=NEW.replacement_memory_id;
  IF replacement_treasury IS NULL OR replacement_treasury<>old_treasury THEN RAISE EXCEPTION 'replacement outcome memory treasury mismatch'; END IF;
  SELECT status INTO replacement_status FROM memory_events WHERE organization_id=NEW.organization_id AND memory_id=NEW.replacement_memory_id ORDER BY ordinal DESC LIMIT 1;
  IF replacement_status<>'APPROVED' THEN RAISE EXCEPTION 'replacement outcome memory is not approved'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER outcome_memory_retirement_guard BEFORE INSERT ON outcome_memory_retirements FOR EACH ROW EXECUTE FUNCTION validate_outcome_memory_retirement();

CREATE TRIGGER outcome_memory_retirement_immutable BEFORE UPDATE OR DELETE ON outcome_memory_retirements FOR EACH ROW EXECUTE FUNCTION prevent_outcome_memory_mutation();
ALTER TABLE outcome_memory_retirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON outcome_memory_retirements USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON outcome_memory_retirements TO aeos_app;
