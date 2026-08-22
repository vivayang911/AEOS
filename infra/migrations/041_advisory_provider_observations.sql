CREATE TABLE advisory_provider_observations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  model_version text NOT NULL,
  operation text NOT NULL DEFAULT 'committee_narrative',
  outcome text NOT NULL CHECK(outcome IN('SUCCESS','TIMEOUT','REQUEST_FAILED','VALIDATION_FAILED','CIRCUIT_OPEN')),
  circuit_before text NOT NULL CHECK(circuit_before IN('CLOSED','OPEN','HALF_OPEN')),
  circuit_after text NOT NULL CHECK(circuit_after IN('CLOSED','OPEN','HALF_OPEN')),
  request_id text,
  input_hash text NOT NULL,
  output_hash text,
  timeout_ms integer NOT NULL CHECK(timeout_ms BETWEEN 1000 AND 30000),
  duration_ms integer NOT NULL CHECK(duration_ms>=0),
  error_code text,
  prompt_or_response_stored boolean NOT NULL DEFAULT false CHECK(prompt_or_response_stored=false),
  asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id),
  CHECK((outcome='SUCCESS')=(output_hash IS NOT NULL)),
  CHECK((outcome='SUCCESS')=(error_code IS NULL))
);
CREATE INDEX advisory_provider_observations_org_created_idx ON advisory_provider_observations(organization_id,created_at DESC,id DESC);
CREATE INDEX advisory_provider_observations_provider_outcome_idx ON advisory_provider_observations(provider,outcome,created_at DESC);
CREATE OR REPLACE FUNCTION prevent_advisory_provider_observation_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'advisory provider observations are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER advisory_provider_observation_immutable BEFORE UPDATE OR DELETE ON advisory_provider_observations
FOR EACH ROW EXECUTE FUNCTION prevent_advisory_provider_observation_mutation();
ALTER TABLE advisory_provider_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON advisory_provider_observations
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON advisory_provider_observations TO aeos_app;
