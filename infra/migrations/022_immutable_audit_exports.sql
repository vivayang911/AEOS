CREATE TABLE audit_exports (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  requested_by text NOT NULL REFERENCES users(id),
  filters jsonb NOT NULL,
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL,
  event_count integer NOT NULL CHECK(event_count BETWEEN 0 AND 1000),
  first_event_id text,
  last_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id),
  UNIQUE(organization_id,manifest_hash),
  CHECK((event_count=0)=(first_event_id IS NULL AND last_event_id IS NULL))
);
CREATE INDEX audit_exports_org_created_idx ON audit_exports(organization_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_audit_export_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit exports are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_export_immutable BEFORE UPDATE OR DELETE ON audit_exports
FOR EACH ROW EXECUTE FUNCTION prevent_audit_export_mutation();

ALTER TABLE audit_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON audit_exports
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON audit_exports TO aeos_app;
