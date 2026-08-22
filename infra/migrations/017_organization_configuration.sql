CREATE TABLE organization_configuration_requests (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  requested_by text NOT NULL REFERENCES users(id),
  config jsonb NOT NULL,
  content_hash text NOT NULL,
  inspection jsonb NOT NULL,
  message_hash text NOT NULL,
  nonce text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at>created_at)
);
CREATE INDEX organization_configuration_requests_org_created_idx ON organization_configuration_requests(organization_id,created_at DESC,id DESC);

CREATE TABLE organization_configuration_versions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK(version>0),
  schema_version text NOT NULL DEFAULT 'organization.configuration.v1',
  config jsonb NOT NULL,
  content_hash text NOT NULL,
  inspection jsonb NOT NULL,
  activated_by text NOT NULL REFERENCES users(id),
  activated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,version),
  UNIQUE(organization_id,content_hash)
);
CREATE INDEX organization_configuration_versions_org_version_idx ON organization_configuration_versions(organization_id,version DESC);

CREATE OR REPLACE FUNCTION prevent_organization_configuration_version_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'organization configuration versions are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER organization_configuration_version_immutable BEFORE UPDATE OR DELETE ON organization_configuration_versions
FOR EACH ROW EXECUTE FUNCTION prevent_organization_configuration_version_mutation();

CREATE OR REPLACE FUNCTION restrict_organization_configuration_request_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by OR NEW.config IS DISTINCT FROM OLD.config
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.inspection IS DISTINCT FROM OLD.inspection
     OR NEW.message_hash IS DISTINCT FROM OLD.message_hash OR NEW.nonce IS DISTINCT FROM OLD.nonce
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'organization configuration request payload is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER organization_configuration_request_restricted BEFORE UPDATE ON organization_configuration_requests
FOR EACH ROW EXECUTE FUNCTION restrict_organization_configuration_request_mutation();

ALTER TABLE organization_configuration_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON organization_configuration_requests
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
ALTER TABLE organization_configuration_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON organization_configuration_versions
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON organization_configuration_requests,organization_configuration_versions TO aeos_app;
