CREATE TABLE governed_skill_versions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  skill_key text NOT NULL,
  version integer NOT NULL CHECK(version > 0),
  name text NOT NULL,
  schema_version text NOT NULL CHECK(schema_version = 'treasury.governed-skill.v1'),
  content jsonb NOT NULL,
  content_hash text NOT NULL CHECK(content_hash ~ '^0x[0-9a-f]{64}$'),
  source_memory_ids text[] NOT NULL CHECK(cardinality(source_memory_ids) BETWEEN 1 AND 20),
  created_by text NOT NULL,
  advisory_only boolean NOT NULL DEFAULT true CHECK(advisory_only = true),
  asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, skill_key, version)
);

CREATE TABLE governed_skill_version_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  skill_version_id text NOT NULL REFERENCES governed_skill_versions(id),
  ordinal integer NOT NULL CHECK(ordinal >= 0),
  status text NOT NULL CHECK(status IN ('DRAFT','APPROVED','REJECTED','RETIRED')),
  actor_id text NOT NULL,
  rationale text NOT NULL,
  payload_hash text NOT NULL CHECK(payload_hash ~ '^0x[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(skill_version_id, ordinal)
);

CREATE TABLE governed_skill_backtests (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  skill_version_id text NOT NULL REFERENCES governed_skill_versions(id),
  suite_version text NOT NULL CHECK(suite_version = 'treasury.governed-skill-backtest.v1'),
  input jsonb NOT NULL,
  input_hash text NOT NULL CHECK(input_hash ~ '^0x[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  result_hash text NOT NULL CHECK(result_hash ~ '^0x[0-9a-f]{64}$'),
  passed boolean NOT NULL,
  created_by text NOT NULL,
  advisory_only boolean NOT NULL DEFAULT true CHECK(advisory_only = true),
  asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, skill_version_id, suite_version)
);

CREATE INDEX governed_skill_versions_org_key_idx ON governed_skill_versions(organization_id, skill_key, version DESC);
CREATE INDEX governed_skill_events_org_skill_idx ON governed_skill_version_events(organization_id, skill_version_id, ordinal DESC);
CREATE INDEX governed_skill_backtests_org_skill_idx ON governed_skill_backtests(organization_id, skill_version_id, created_at DESC);

CREATE OR REPLACE FUNCTION validate_governed_skill_lineage() RETURNS trigger AS $$
DECLARE source_id text; approved_count integer; distinct_count integer;
BEGIN
  SELECT count(DISTINCT value) INTO distinct_count FROM unnest(NEW.source_memory_ids) AS value;
  IF distinct_count <> cardinality(NEW.source_memory_ids) THEN RAISE EXCEPTION 'governed skill source memories must be unique'; END IF;
  FOREACH source_id IN ARRAY NEW.source_memory_ids LOOP
    SELECT count(*) INTO approved_count
      FROM organization_memories memory
     WHERE memory.id = source_id
       AND memory.organization_id = NEW.organization_id
       AND memory.memory_type = 'ENTERPRISE'
       AND (memory.valid_until IS NULL OR memory.valid_until > now())
       AND (SELECT event.status FROM memory_events event
              WHERE event.organization_id = memory.organization_id AND event.memory_id = memory.id
              ORDER BY event.ordinal DESC LIMIT 1) = 'APPROVED';
    IF approved_count <> 1 THEN RAISE EXCEPTION 'governed skill source memory is not approved enterprise memory in this organization'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER governed_skill_lineage_guard BEFORE INSERT ON governed_skill_versions
FOR EACH ROW EXECUTE FUNCTION validate_governed_skill_lineage();

CREATE OR REPLACE FUNCTION validate_governed_skill_child_organization() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM governed_skill_versions skill WHERE skill.id=NEW.skill_version_id AND skill.organization_id=NEW.organization_id)
  THEN RAISE EXCEPTION 'governed skill organization mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER governed_skill_event_tenant_guard BEFORE INSERT ON governed_skill_version_events
FOR EACH ROW EXECUTE FUNCTION validate_governed_skill_child_organization();
CREATE TRIGGER governed_skill_backtest_tenant_guard BEFORE INSERT ON governed_skill_backtests
FOR EACH ROW EXECUTE FUNCTION validate_governed_skill_child_organization();

CREATE OR REPLACE FUNCTION reject_governed_skill_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'governed skill records are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER governed_skill_version_immutable BEFORE UPDATE OR DELETE ON governed_skill_versions FOR EACH ROW EXECUTE FUNCTION reject_governed_skill_mutation();
CREATE TRIGGER governed_skill_event_immutable BEFORE UPDATE OR DELETE ON governed_skill_version_events FOR EACH ROW EXECUTE FUNCTION reject_governed_skill_mutation();
CREATE TRIGGER governed_skill_backtest_immutable BEFORE UPDATE OR DELETE ON governed_skill_backtests FOR EACH ROW EXECUTE FUNCTION reject_governed_skill_mutation();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['governed_skill_versions','governed_skill_version_events','governed_skill_backtests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_organization_isolation ON %I USING (aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK (aeos_is_system_worker() OR organization_id=aeos_current_organization_id())', table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO aeos_app', table_name);
  END LOOP;
END $$;
