CREATE TABLE treasury_workflows(
 id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),chain_id integer NOT NULL CHECK(chain_id>0),treasury_address text NOT NULL CHECK(treasury_address~'^0x[0-9a-f]{40}$'),treasury_key text NOT NULL,
 workload_type text NOT NULL CHECK(workload_type IN('EVIDENCE_REFRESH','DECISION_ANALYSIS','POLICY_SIMULATION','MONITORING_SCAN','GOVERNANCE_PREPARATION','EXECUTION_PREFLIGHT','EXECUTION_RECONCILIATION')),
 concurrency_class text NOT NULL CHECK(concurrency_class IN('ADVISORY','EXCLUSIVE')),resource_type text NOT NULL CHECK(resource_type~'^[a-z][a-z0-9_]{1,63}$'),resource_id text NOT NULL,idempotency_key text NOT NULL,input jsonb NOT NULL,input_hash text NOT NULL CHECK(input_hash~'^0x[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','RUNNING','COMPLETED','FAILED','TIMED_OUT','CANCELLED')),priority integer NOT NULL DEFAULT 50 CHECK(priority BETWEEN 0 AND 100),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 5),lease_owner text,claim_token_hash text,lease_expires_at timestamptz,result jsonb,result_hash text,last_error_code text,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 UNIQUE(organization_id,idempotency_key),CHECK(treasury_key=chain_id::text||':'||treasury_address),CHECK((status='RUNNING')=(lease_owner IS NOT NULL AND claim_token_hash IS NOT NULL AND lease_expires_at IS NOT NULL)),CHECK(status NOT IN('COMPLETED','FAILED','TIMED_OUT','CANCELLED') OR completed_at IS NOT NULL),CHECK((status='COMPLETED')=(result IS NOT NULL AND result_hash IS NOT NULL))
);
CREATE INDEX treasury_workflows_claim_idx ON treasury_workflows(status,priority DESC,created_at,id);
CREATE INDEX treasury_workflows_treasury_idx ON treasury_workflows(organization_id,treasury_key,status,created_at DESC);
CREATE UNIQUE INDEX treasury_workflows_exclusive_running_idx ON treasury_workflows(organization_id,treasury_key) WHERE concurrency_class='EXCLUSIVE' AND status='RUNNING';

CREATE TABLE treasury_workflow_events(
 id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),workflow_id text NOT NULL REFERENCES treasury_workflows(id),ordinal integer NOT NULL CHECK(ordinal>0),event_type text NOT NULL CHECK(event_type IN('QUEUED','CLAIMED','COMPLETED','FAILED','TIMED_OUT','CANCELLED','LEASE_RECOVERED')),actor jsonb NOT NULL,data jsonb NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^0x[0-9a-f]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,workflow_id,ordinal)
);
CREATE INDEX treasury_workflow_events_org_workflow_idx ON treasury_workflow_events(organization_id,workflow_id,ordinal);

CREATE OR REPLACE FUNCTION protect_treasury_workflow() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'treasury workflows cannot be deleted'; END IF;
 IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.chain_id IS DISTINCT FROM OLD.chain_id OR NEW.treasury_address IS DISTINCT FROM OLD.treasury_address OR NEW.treasury_key IS DISTINCT FROM OLD.treasury_key OR NEW.workload_type IS DISTINCT FROM OLD.workload_type OR NEW.concurrency_class IS DISTINCT FROM OLD.concurrency_class OR NEW.resource_type IS DISTINCT FROM OLD.resource_type OR NEW.resource_id IS DISTINCT FROM OLD.resource_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.input IS DISTINCT FROM OLD.input OR NEW.input_hash IS DISTINCT FROM OLD.input_hash OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'treasury workflow immutable input cannot change'; END IF;
 IF OLD.status IN('COMPLETED','FAILED','TIMED_OUT','CANCELLED') THEN RAISE EXCEPTION 'terminal treasury workflow cannot change'; END IF;
 IF (OLD.status='QUEUED' AND NEW.status NOT IN('QUEUED','RUNNING','CANCELLED')) OR (OLD.status='RUNNING' AND NEW.status NOT IN('RUNNING','COMPLETED','FAILED','TIMED_OUT','QUEUED')) THEN RAISE EXCEPTION 'treasury workflow transition is not permitted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER treasury_workflow_restricted BEFORE UPDATE OR DELETE ON treasury_workflows FOR EACH ROW EXECUTE FUNCTION protect_treasury_workflow();
CREATE OR REPLACE FUNCTION protect_treasury_workflow_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'treasury workflow events are immutable'; END $$;
CREATE TRIGGER treasury_workflow_event_immutable BEFORE UPDATE OR DELETE ON treasury_workflow_events FOR EACH ROW EXECUTE FUNCTION protect_treasury_workflow_event();
CREATE OR REPLACE FUNCTION validate_treasury_workflow_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM treasury_workflows w WHERE w.id=NEW.workflow_id AND w.organization_id=NEW.organization_id)THEN RAISE EXCEPTION 'treasury workflow event tenant mismatch';END IF;RETURN NEW;END $$;
CREATE TRIGGER treasury_workflow_event_tenant_guard BEFORE INSERT ON treasury_workflow_events FOR EACH ROW EXECUTE FUNCTION validate_treasury_workflow_event();

ALTER TABLE treasury_workflows ENABLE ROW LEVEL SECURITY;ALTER TABLE treasury_workflow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON treasury_workflows USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
CREATE POLICY tenant_organization_isolation ON treasury_workflow_events USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON treasury_workflows,treasury_workflow_events TO aeos_app;
