CREATE TABLE cockpit_stream_leases (
  connection_id uuid PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  advisory_only boolean NOT NULL DEFAULT true CHECK(advisory_only=true),
  asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized=false),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cockpit_stream_leases_expiry_idx ON cockpit_stream_leases(expires_at);
CREATE INDEX cockpit_stream_leases_org_expiry_idx ON cockpit_stream_leases(organization_id,expires_at);
ALTER TABLE cockpit_stream_leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON cockpit_stream_leases
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON cockpit_stream_leases TO aeos_app;
