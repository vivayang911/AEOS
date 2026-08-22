CREATE TABLE provider_call_observations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  operation text NOT NULL,
  outcome text NOT NULL CHECK(outcome IN('SUCCESS','RETRYABLE_FAILURE','NON_RETRYABLE_FAILURE','CIRCUIT_OPEN')),
  attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 3),
  circuit_before text NOT NULL CHECK(circuit_before IN('CLOSED','OPEN','HALF_OPEN')),
  circuit_after text NOT NULL CHECK(circuit_after IN('CLOSED','OPEN','HALF_OPEN')),
  request_id text,
  provider_request_id text NOT NULL,
  correlation_origin text NOT NULL DEFAULT 'AEOS_GENERATED' CHECK(correlation_origin='AEOS_GENERATED'),
  duration_ms integer NOT NULL CHECK(duration_ms>=0),
  result_hash text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id),
  CHECK((outcome='SUCCESS')=(result_hash IS NOT NULL)),
  CHECK((outcome='SUCCESS')=(error_code IS NULL))
);
CREATE INDEX provider_call_observations_org_created_idx ON provider_call_observations(organization_id,created_at DESC,id DESC);
CREATE INDEX provider_call_observations_provider_outcome_idx ON provider_call_observations(provider,outcome,created_at DESC);

CREATE OR REPLACE FUNCTION prevent_provider_call_observation_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'provider call observations are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER provider_call_observation_immutable BEFORE UPDATE OR DELETE ON provider_call_observations
FOR EACH ROW EXECUTE FUNCTION prevent_provider_call_observation_mutation();

ALTER TABLE provider_call_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON provider_call_observations
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON provider_call_observations TO aeos_app;
