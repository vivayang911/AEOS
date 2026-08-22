CREATE TABLE evidence_requests(
 id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),decision_id text NOT NULL REFERENCES decisions(id),agent_run_id text NOT NULL REFERENCES agent_runs(id),
 schema_version text NOT NULL CHECK(schema_version='evidence.request.v1'),requesting_role text NOT NULL CHECK(requesting_role IN('Governor','Research','Strategy','Quant','Risk','Compliance','Portfolio','Treasury')),
 gap_code text NOT NULL,gap_type text NOT NULL CHECK(gap_type IN('BALANCE','TRANSACTION','EVENT')),source_chain_id integer NOT NULL,
 subject text NOT NULL,transaction_hash text,event_type text,from_block bigint,to_block bigint,required_fields jsonb NOT NULL,
 required_confirmations integer NOT NULL,max_freshness_seconds integer NOT NULL,priority text NOT NULL CHECK(priority IN('LOW','MEDIUM','HIGH')),
 rationale text NOT NULL,supporting_evidence_ids jsonb NOT NULL,budget jsonb NOT NULL,broker_version text NOT NULL,request_hash text NOT NULL,
 asset_execution_authorized boolean NOT NULL CHECK(asset_execution_authorized=false),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,decision_id,request_hash)
);
CREATE TABLE evidence_request_events(
 id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),request_id text NOT NULL REFERENCES evidence_requests(id),ordinal integer NOT NULL,
 status text NOT NULL CHECK(status IN('PROPOSED','VALIDATED','QUEUED','DISCOVERING','NORMALIZED','INDEXED','SATISFIED','UNSATISFIED','REJECTED','QUARANTINED','FAILED')),
 reason_code text,evidence_id text REFERENCES evidence(id),details jsonb NOT NULL,payload_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(request_id,ordinal)
);
CREATE INDEX evidence_request_org_decision_idx ON evidence_requests(organization_id,decision_id,created_at,id);
CREATE INDEX evidence_request_event_org_request_idx ON evidence_request_events(organization_id,request_id,ordinal);
CREATE OR REPLACE FUNCTION reject_evidence_request_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Evidence request history is immutable'; END $$;
CREATE TRIGGER evidence_request_immutable BEFORE UPDATE OR DELETE ON evidence_requests FOR EACH ROW EXECUTE FUNCTION reject_evidence_request_mutation();
CREATE TRIGGER evidence_request_event_immutable BEFORE UPDATE OR DELETE ON evidence_request_events FOR EACH ROW EXECUTE FUNCTION reject_evidence_request_mutation();
CREATE OR REPLACE FUNCTION validate_evidence_request_tenant_refs() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM decisions WHERE id=NEW.decision_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Evidence request Decision organization mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM agent_runs WHERE id=NEW.agent_run_id AND decision_id=NEW.decision_id AND organization_id=NEW.organization_id AND role=NEW.requesting_role) THEN RAISE EXCEPTION 'Evidence request Agent run identity mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.supporting_evidence_ids) e WHERE NOT EXISTS(SELECT 1 FROM evidence WHERE id=e AND organization_id=NEW.organization_id)) THEN RAISE EXCEPTION 'Evidence request supporting Evidence organization mismatch'; END IF;
 RETURN NEW;END $$;
CREATE TRIGGER evidence_request_tenant_refs BEFORE INSERT ON evidence_requests FOR EACH ROW EXECUTE FUNCTION validate_evidence_request_tenant_refs();
CREATE OR REPLACE FUNCTION validate_evidence_request_event_sequence() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE previous_status text;BEGIN
 IF NEW.ordinal=1 AND NEW.status<>'PROPOSED' THEN RAISE EXCEPTION 'Evidence request must begin PROPOSED'; END IF;
 IF NEW.ordinal>1 THEN SELECT status INTO previous_status FROM evidence_request_events WHERE request_id=NEW.request_id AND ordinal=NEW.ordinal-1;
  IF previous_status IS NULL THEN RAISE EXCEPTION 'Evidence request event ordinal gap'; END IF;
  IF NOT ((previous_status='PROPOSED' AND NEW.status IN('VALIDATED','REJECTED')) OR (previous_status='VALIDATED' AND NEW.status='QUEUED') OR (previous_status='QUEUED' AND NEW.status='DISCOVERING') OR (previous_status='DISCOVERING' AND NEW.status IN('NORMALIZED','UNSATISFIED','QUARANTINED','FAILED')) OR (previous_status='NORMALIZED' AND NEW.status='INDEXED') OR (previous_status='INDEXED' AND NEW.status='SATISFIED')) THEN RAISE EXCEPTION 'Invalid Evidence request lifecycle transition'; END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER evidence_request_event_sequence BEFORE INSERT ON evidence_request_events FOR EACH ROW EXECUTE FUNCTION validate_evidence_request_event_sequence();
CREATE OR REPLACE FUNCTION validate_evidence_request_event_tenant_refs() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM evidence_requests WHERE id=NEW.request_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Evidence request event organization mismatch'; END IF;
 IF NEW.evidence_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM evidence WHERE id=NEW.evidence_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Evidence request event Evidence organization mismatch'; END IF;
 RETURN NEW;END $$;
CREATE TRIGGER evidence_request_event_tenant_refs BEFORE INSERT ON evidence_request_events FOR EACH ROW EXECUTE FUNCTION validate_evidence_request_event_tenant_refs();
DO $$ DECLARE table_name text;BEGIN FOREACH table_name IN ARRAY ARRAY['evidence_requests','evidence_request_events'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);EXECUTE format('CREATE POLICY tenant_organization_isolation ON %I USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())',table_name);EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO aeos_app',table_name);END LOOP;END $$;

