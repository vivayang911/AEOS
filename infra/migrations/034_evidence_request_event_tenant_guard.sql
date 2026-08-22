CREATE OR REPLACE FUNCTION validate_evidence_request_event_tenant_refs() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM evidence_requests WHERE id=NEW.request_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Evidence request event organization mismatch'; END IF;
 IF NEW.evidence_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM evidence WHERE id=NEW.evidence_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Evidence request event Evidence organization mismatch'; END IF;
 RETURN NEW;END $$;
DROP TRIGGER IF EXISTS evidence_request_event_tenant_refs ON evidence_request_events;
CREATE TRIGGER evidence_request_event_tenant_refs BEFORE INSERT ON evidence_request_events FOR EACH ROW EXECUTE FUNCTION validate_evidence_request_event_tenant_refs();
