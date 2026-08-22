CREATE OR REPLACE FUNCTION validate_agent_message_evidence_request_ref() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.evidence_request_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM evidence_requests r WHERE r.id=NEW.evidence_request_id AND r.organization_id=NEW.organization_id AND r.decision_id=NEW.decision_id
 ) THEN RAISE EXCEPTION 'A2A Evidence request organization or Decision mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agent_message_evidence_request_ref BEFORE INSERT ON agent_messages FOR EACH ROW EXECUTE FUNCTION validate_agent_message_evidence_request_ref();
