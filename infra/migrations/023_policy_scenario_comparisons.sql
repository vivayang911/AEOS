CREATE TABLE policy_scenario_comparisons (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  suite_version text NOT NULL,
  policy_version_ids text[] NOT NULL,
  input jsonb NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  result_hash text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id),
  UNIQUE(organization_id,input_hash),
  CHECK(cardinality(policy_version_ids) BETWEEN 2 AND 5)
);
CREATE INDEX policy_scenario_comparisons_org_created_idx ON policy_scenario_comparisons(organization_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION prevent_policy_scenario_comparison_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'policy scenario comparisons are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER policy_scenario_comparison_immutable BEFORE UPDATE OR DELETE ON policy_scenario_comparisons
FOR EACH ROW EXECUTE FUNCTION prevent_policy_scenario_comparison_mutation();

ALTER TABLE policy_scenario_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON policy_scenario_comparisons
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON policy_scenario_comparisons TO aeos_app;
