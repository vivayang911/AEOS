CREATE TABLE treasury_registry_versions(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id),
 treasury_id text NOT NULL CHECK(treasury_id~'^trs_[a-z0-9][a-z0-9_-]{2,62}$'),
 version integer NOT NULL CHECK(version>0),
 previous_version_id text REFERENCES treasury_registry_versions(id),
 schema_version text NOT NULL DEFAULT 'treasury.registry.v1',
 state text NOT NULL CHECK(state IN('ACTIVE','RETIRED')),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 2 AND 80),
 chain_id integer NOT NULL CHECK(chain_id>0),
 treasury_address text NOT NULL CHECK(treasury_address~'^0x[0-9a-f]{40}$'),
 governor_address text NOT NULL CHECK(governor_address~'^0x[0-9a-f]{40}$'),
 timelock_address text NOT NULL CHECK(timelock_address~'^0x[0-9a-f]{40}$'),
 safe_address text NOT NULL CHECK(safe_address~'^0x[0-9a-f]{40}$'),
 treasury_guard_address text NOT NULL CHECK(treasury_guard_address~'^0x[0-9a-f]{40}$'),
 policy_registry_address text NOT NULL CHECK(policy_registry_address~'^0x[0-9a-f]{40}$'),
 policy_version_id text,
 config jsonb NOT NULL,
 content_hash text NOT NULL CHECK(content_hash~'^0x[0-9a-f]{64}$'),
 change_reason text NOT NULL CHECK(length(change_reason) BETWEEN 3 AND 240),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,treasury_id,version),
 UNIQUE(organization_id,treasury_id,content_hash),
 UNIQUE(organization_id,id),
 CHECK((version=1 AND previous_version_id IS NULL) OR (version>1 AND previous_version_id IS NOT NULL)),
 CHECK(config->>'chainId'=chain_id::text AND config->>'treasuryAddress'=treasury_address)
);
CREATE INDEX treasury_registry_versions_current_idx ON treasury_registry_versions(organization_id,treasury_id,version DESC);
CREATE INDEX treasury_registry_versions_address_idx ON treasury_registry_versions(organization_id,chain_id,treasury_address,version DESC);

CREATE TABLE treasury_registry_events(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id),
 treasury_id text NOT NULL,
 registry_version_id text NOT NULL REFERENCES treasury_registry_versions(id),
 event_type text NOT NULL CHECK(event_type IN('REGISTERED','VERSIONED','RETIRED')),
 actor jsonb NOT NULL,
 data jsonb NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash~'^0x[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,registry_version_id)
);
CREATE INDEX treasury_registry_events_history_idx ON treasury_registry_events(organization_id,treasury_id,created_at,id);

-- Bind pre-migration workflows to deterministic immutable legacy registry snapshots.
INSERT INTO treasury_registry_versions(id,organization_id,treasury_id,version,state,display_name,chain_id,treasury_address,governor_address,timelock_address,safe_address,treasury_guard_address,policy_registry_address,config,content_hash,change_reason,created_by,created_at)
SELECT 'trv_legacy_'||substr(md5(organization_id||':'||treasury_key),1,24),organization_id,'trs_legacy_'||substr(md5(treasury_key),1,20),1,'RETIRED','Legacy workflow treasury',chain_id,treasury_address,
 '0x0000000000000000000000000000000000000000','0x0000000000000000000000000000000000000000','0x0000000000000000000000000000000000000000','0x0000000000000000000000000000000000000000','0x0000000000000000000000000000000000000000',
 jsonb_build_object('schemaVersion','treasury.registry.v1','chainId',chain_id,'treasuryAddress',treasury_address,'legacyMigration',true),
 '0x'||md5(jsonb_build_object('organizationId',organization_id,'treasuryKey',treasury_key,'legacyMigration',true)::text)||md5('aeos:'||jsonb_build_object('organizationId',organization_id,'treasuryKey',treasury_key,'legacyMigration',true)::text),
 'Migration-only retired snapshot',min(created_by),min(created_at)
FROM treasury_workflows GROUP BY organization_id,treasury_key,chain_id,treasury_address;

ALTER TABLE treasury_workflows ADD COLUMN treasury_registry_version_id text REFERENCES treasury_registry_versions(id);
ALTER TABLE treasury_workflows DISABLE TRIGGER treasury_workflow_restricted;
UPDATE treasury_workflows w SET treasury_registry_version_id=r.id FROM treasury_registry_versions r
 WHERE r.organization_id=w.organization_id AND r.chain_id=w.chain_id AND r.treasury_address=w.treasury_address AND r.config->>'legacyMigration'='true';
ALTER TABLE treasury_workflows ENABLE TRIGGER treasury_workflow_restricted;
ALTER TABLE treasury_workflows ALTER COLUMN treasury_registry_version_id SET NOT NULL;
CREATE INDEX treasury_workflows_registry_version_idx ON treasury_workflows(organization_id,treasury_registry_version_id,status);

CREATE OR REPLACE FUNCTION protect_treasury_registry_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'treasury registry snapshots are immutable'; END $$;
CREATE TRIGGER treasury_registry_version_immutable BEFORE UPDATE OR DELETE ON treasury_registry_versions FOR EACH ROW EXECUTE FUNCTION protect_treasury_registry_snapshot();
CREATE TRIGGER treasury_registry_event_immutable BEFORE UPDATE OR DELETE ON treasury_registry_events FOR EACH ROW EXECUTE FUNCTION protect_treasury_registry_snapshot();

CREATE OR REPLACE FUNCTION validate_treasury_registry_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior treasury_registry_versions%ROWTYPE;
BEGIN
 IF NEW.version=1 THEN
  IF EXISTS(SELECT 1 FROM treasury_registry_versions WHERE organization_id=NEW.organization_id AND treasury_id=NEW.treasury_id) THEN RAISE EXCEPTION 'treasury registry initial version already exists'; END IF;
 ELSE
  SELECT * INTO prior FROM treasury_registry_versions WHERE id=NEW.previous_version_id;
  IF prior.id IS NULL OR prior.organization_id<>NEW.organization_id OR prior.treasury_id<>NEW.treasury_id OR prior.version<>NEW.version-1 THEN RAISE EXCEPTION 'treasury registry version lineage mismatch'; END IF;
  IF prior.state='RETIRED' THEN RAISE EXCEPTION 'retired treasury cannot be reactivated'; END IF;
 END IF;
 IF NEW.state='ACTIVE' AND EXISTS(
  SELECT 1 FROM treasury_registry_versions other
  WHERE other.organization_id=NEW.organization_id AND other.treasury_id<>NEW.treasury_id AND other.chain_id=NEW.chain_id AND other.treasury_address=NEW.treasury_address AND other.state='ACTIVE'
    AND other.version=(SELECT max(x.version) FROM treasury_registry_versions x WHERE x.organization_id=other.organization_id AND x.treasury_id=other.treasury_id)
 ) THEN RAISE EXCEPTION 'treasury address is already registered'; END IF;
 IF NEW.version>1 AND EXISTS(SELECT 1 FROM treasury_workflows w JOIN treasury_registry_versions bound ON bound.id=w.treasury_registry_version_id WHERE w.organization_id=NEW.organization_id AND bound.treasury_id=NEW.treasury_id AND w.concurrency_class='EXCLUSIVE' AND w.status='RUNNING') THEN RAISE EXCEPTION 'treasury has running exclusive workflow'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER treasury_registry_version_guard BEFORE INSERT ON treasury_registry_versions FOR EACH ROW EXECUTE FUNCTION validate_treasury_registry_version();

CREATE OR REPLACE FUNCTION validate_treasury_registry_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM treasury_registry_versions r WHERE r.id=NEW.registry_version_id AND r.organization_id=NEW.organization_id AND r.treasury_id=NEW.treasury_id) THEN RAISE EXCEPTION 'treasury registry event tenant or lineage mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER treasury_registry_event_guard BEFORE INSERT ON treasury_registry_events FOR EACH ROW EXECUTE FUNCTION validate_treasury_registry_event();

CREATE OR REPLACE FUNCTION validate_workflow_registry_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM treasury_registry_versions r
  WHERE r.id=NEW.treasury_registry_version_id AND r.organization_id=NEW.organization_id AND r.chain_id=NEW.chain_id AND r.treasury_address=NEW.treasury_address AND r.state='ACTIVE'
    AND r.version=(SELECT max(x.version) FROM treasury_registry_versions x WHERE x.organization_id=r.organization_id AND x.treasury_id=r.treasury_id)
 ) THEN RAISE EXCEPTION 'treasury workflow requires current active registry version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER treasury_workflow_registry_guard BEFORE INSERT ON treasury_workflows FOR EACH ROW EXECUTE FUNCTION validate_workflow_registry_binding();

CREATE OR REPLACE FUNCTION protect_treasury_workflow() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'treasury workflows cannot be deleted'; END IF;
 IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.chain_id IS DISTINCT FROM OLD.chain_id OR NEW.treasury_address IS DISTINCT FROM OLD.treasury_address OR NEW.treasury_key IS DISTINCT FROM OLD.treasury_key OR NEW.treasury_registry_version_id IS DISTINCT FROM OLD.treasury_registry_version_id OR NEW.workload_type IS DISTINCT FROM OLD.workload_type OR NEW.concurrency_class IS DISTINCT FROM OLD.concurrency_class OR NEW.resource_type IS DISTINCT FROM OLD.resource_type OR NEW.resource_id IS DISTINCT FROM OLD.resource_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.input IS DISTINCT FROM OLD.input OR NEW.input_hash IS DISTINCT FROM OLD.input_hash OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'treasury workflow immutable input cannot change'; END IF;
 IF OLD.status IN('COMPLETED','FAILED','TIMED_OUT','CANCELLED') THEN RAISE EXCEPTION 'terminal treasury workflow cannot change'; END IF;
 IF (OLD.status='QUEUED' AND NEW.status NOT IN('QUEUED','RUNNING','CANCELLED')) OR (OLD.status='RUNNING' AND NEW.status NOT IN('RUNNING','COMPLETED','FAILED','TIMED_OUT','QUEUED')) THEN RAISE EXCEPTION 'treasury workflow transition is not permitted'; END IF;
 RETURN NEW;
END $$;

ALTER TABLE treasury_registry_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_registry_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON treasury_registry_versions USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
CREATE POLICY tenant_organization_isolation ON treasury_registry_events USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON treasury_registry_versions,treasury_registry_events TO aeos_app;
