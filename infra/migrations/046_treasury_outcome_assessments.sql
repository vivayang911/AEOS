CREATE TABLE treasury_outcome_assessments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  treasury_id text NOT NULL,
  policy_version_id text NOT NULL REFERENCES policy_versions(id),
  before_adaptive_pid_snapshot_id text NOT NULL REFERENCES adaptive_pid_snapshots(id),
  after_adaptive_pid_snapshot_id text NOT NULL REFERENCES adaptive_pid_snapshots(id),
  safe_observation_id text REFERENCES safe_transaction_observations(id),
  proposal_id text REFERENCES proposals(id),
  classification text NOT NULL CHECK(classification IN('IMPROVED_DESCRIPTIVE','WORSENED_DESCRIPTIVE','UNCHANGED_DESCRIPTIVE')),
  assessment jsonb NOT NULL,
  assessment_hash text NOT NULL CHECK(assessment_hash~'^0x[0-9a-f]{64}$'),
  created_by text NOT NULL,
  causal_attribution_established boolean NOT NULL DEFAULT false CHECK(causal_attribution_established=false),
  counterfactual_available boolean NOT NULL DEFAULT false CHECK(counterfactual_available=false),
  memory_promotion_authorized boolean NOT NULL DEFAULT false CHECK(memory_promotion_authorized=false),
  skill_promotion_authorized boolean NOT NULL DEFAULT false CHECK(skill_promotion_authorized=false),
  advisory_only boolean NOT NULL DEFAULT true CHECK(advisory_only=true),
  asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(before_adaptive_pid_snapshot_id<>after_adaptive_pid_snapshot_id)
);
CREATE UNIQUE INDEX treasury_outcome_assessments_identity_unique ON treasury_outcome_assessments(organization_id,before_adaptive_pid_snapshot_id,after_adaptive_pid_snapshot_id,coalesce(safe_observation_id,''));
CREATE INDEX treasury_outcome_assessments_org_treasury_created_idx ON treasury_outcome_assessments(organization_id,treasury_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION guard_treasury_outcome_assessment() RETURNS trigger AS $$
DECLARE b adaptive_pid_snapshots%ROWTYPE; a adaptive_pid_snapshots%ROWTYPE; s safe_transaction_observations%ROWTYPE; p execution_preflights%ROWTYPE;
BEGIN
 SELECT * INTO b FROM adaptive_pid_snapshots WHERE id=NEW.before_adaptive_pid_snapshot_id;
 SELECT * INTO a FROM adaptive_pid_snapshots WHERE id=NEW.after_adaptive_pid_snapshot_id;
 IF b.organization_id IS DISTINCT FROM NEW.organization_id OR a.organization_id IS DISTINCT FROM NEW.organization_id OR b.treasury_id IS DISTINCT FROM NEW.treasury_id OR a.treasury_id IS DISTINCT FROM NEW.treasury_id OR b.policy_version_id IS DISTINCT FROM NEW.policy_version_id OR a.policy_version_id IS DISTINCT FROM NEW.policy_version_id THEN RAISE EXCEPTION 'treasury outcome PID lineage mismatch'; END IF;
 IF b.input->>'sourceMode'<>'EVIDENCE_DERIVED_OBSERVED_STATE' OR a.input->>'sourceMode'<>'EVIDENCE_DERIVED_OBSERVED_STATE' THEN RAISE EXCEPTION 'treasury outcome requires Evidence-bound PID snapshots'; END IF;
 IF (a.input#>>'{observedState,observationAt}')::timestamptz <= (b.input#>>'{observedState,observationAt}')::timestamptz THEN RAISE EXCEPTION 'treasury outcome observations are out of order'; END IF;
 IF NEW.safe_observation_id IS NOT NULL THEN SELECT * INTO s FROM safe_transaction_observations WHERE id=NEW.safe_observation_id;SELECT * INTO p FROM execution_preflights WHERE id=s.preflight_id;IF s.organization_id IS DISTINCT FROM NEW.organization_id OR s.state<>'EXECUTED' OR s.onchain_execution_confirmed<>true OR s.execution_tx_hash IS NULL OR s.execution_block_number IS NULL OR s.execution_block_hash IS NULL OR p.policy_version_id IS DISTINCT FROM NEW.policy_version_id OR s.proposal_id IS DISTINCT FROM NEW.proposal_id OR s.observed_at<(b.input#>>'{observedState,observationAt}')::timestamptz OR s.observed_at>(a.input#>>'{observedState,observationAt}')::timestamptz THEN RAISE EXCEPTION 'treasury outcome execution lineage mismatch';END IF;ELSIF NEW.proposal_id IS NOT NULL THEN RAISE EXCEPTION 'proposal requires confirmed Safe observation';END IF;
 RETURN NEW;
END;$$ LANGUAGE plpgsql;
CREATE TRIGGER treasury_outcome_lineage_guard BEFORE INSERT ON treasury_outcome_assessments FOR EACH ROW EXECUTE FUNCTION guard_treasury_outcome_assessment();
CREATE OR REPLACE FUNCTION prevent_treasury_outcome_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'treasury outcome assessments are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER treasury_outcome_immutable BEFORE UPDATE OR DELETE ON treasury_outcome_assessments FOR EACH ROW EXECUTE FUNCTION prevent_treasury_outcome_mutation();
ALTER TABLE treasury_outcome_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON treasury_outcome_assessments USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON treasury_outcome_assessments TO aeos_app;
