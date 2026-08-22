CREATE TABLE treasury_counterfactual_assessments(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id),
 treasury_outcome_id text NOT NULL REFERENCES treasury_outcome_assessments(id),
 treasury_id text NOT NULL,
 policy_version_id text NOT NULL REFERENCES policy_versions(id),
 safe_observation_id text NOT NULL REFERENCES safe_transaction_observations(id),
 methodology_version_id text NOT NULL REFERENCES counterfactual_methodology_versions(id),
 transaction_cost_assessment_id text NOT NULL REFERENCES treasury_transaction_cost_assessments(id),
 evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
 classification text NOT NULL CHECK(classification IN('OUTPERFORMED_BASELINE_AFTER_OBSERVED_COSTS','UNDERPERFORMED_BASELINE_AFTER_OBSERVED_COSTS','MATCHED_BASELINE_AFTER_OBSERVED_COSTS')),
 assessment jsonb NOT NULL,
 assessment_hash text NOT NULL CHECK(assessment_hash~'^0x[0-9a-f]{64}$'),
 created_by text NOT NULL,
 counterfactual_estimate_available boolean NOT NULL DEFAULT true CHECK(counterfactual_estimate_available=true),
 counterfactual_is_observed_fact boolean NOT NULL DEFAULT false CHECK(counterfactual_is_observed_fact=false),
 causal_attribution_established boolean NOT NULL DEFAULT false CHECK(causal_attribution_established=false),
 causal_net_benefit_established boolean NOT NULL DEFAULT false CHECK(causal_net_benefit_established=false),
 external_factors_statistically_controlled boolean NOT NULL DEFAULT false CHECK(external_factors_statistically_controlled=false),
 memory_promotion_authorized boolean NOT NULL DEFAULT false CHECK(memory_promotion_authorized=false),
 skill_promotion_authorized boolean NOT NULL DEFAULT false CHECK(skill_promotion_authorized=false),
 advisory_only boolean NOT NULL DEFAULT true CHECK(advisory_only=true),
 asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized=false),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,treasury_outcome_id,methodology_version_id,transaction_cost_assessment_id,evidence_snapshot_id)
);
CREATE INDEX treasury_counterfactual_org_outcome_idx ON treasury_counterfactual_assessments(organization_id,treasury_outcome_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION guard_treasury_counterfactual_assessment() RETURNS trigger AS $$
DECLARE o treasury_outcome_assessments%ROWTYPE; s safe_transaction_observations%ROWTYPE; m counterfactual_methodology_versions%ROWTYPE; c treasury_transaction_cost_assessments%ROWTYPE; es evidence_snapshots%ROWTYPE; approval counterfactual_methodology_events%ROWTYPE; latest counterfactual_methodology_events%ROWTYPE;
BEGIN
 SELECT * INTO o FROM treasury_outcome_assessments WHERE id=NEW.treasury_outcome_id;
 SELECT * INTO s FROM safe_transaction_observations WHERE id=NEW.safe_observation_id;
 SELECT * INTO m FROM counterfactual_methodology_versions WHERE id=NEW.methodology_version_id;
 SELECT * INTO c FROM treasury_transaction_cost_assessments WHERE id=NEW.transaction_cost_assessment_id;
 SELECT * INTO es FROM evidence_snapshots WHERE id=NEW.evidence_snapshot_id;
 SELECT * INTO approval FROM counterfactual_methodology_events WHERE methodology_version_id=NEW.methodology_version_id AND status='HUMAN_APPROVED' ORDER BY ordinal DESC LIMIT 1;
 SELECT * INTO latest FROM counterfactual_methodology_events WHERE methodology_version_id=NEW.methodology_version_id ORDER BY ordinal DESC LIMIT 1;
 IF o.organization_id IS DISTINCT FROM NEW.organization_id OR o.treasury_id IS DISTINCT FROM NEW.treasury_id OR o.policy_version_id IS DISTINCT FROM NEW.policy_version_id OR o.safe_observation_id IS DISTINCT FROM NEW.safe_observation_id THEN RAISE EXCEPTION 'counterfactual outcome lineage mismatch';END IF;
 IF s.organization_id IS DISTINCT FROM NEW.organization_id OR s.state<>'EXECUTED' OR s.onchain_execution_confirmed<>true OR s.execution_tx_hash IS NULL OR s.execution_block_number IS NULL OR s.execution_block_hash IS NULL THEN RAISE EXCEPTION 'counterfactual execution lineage mismatch';END IF;
 IF m.organization_id IS DISTINCT FROM NEW.organization_id OR m.treasury_id IS DISTINCT FROM NEW.treasury_id OR m.policy_version_id IS DISTINCT FROM NEW.policy_version_id OR latest.status<>'HUMAN_APPROVED' OR approval.created_at>=s.observed_at THEN RAISE EXCEPTION 'counterfactual methodology is not prospectively effective';END IF;
 IF c.organization_id IS DISTINCT FROM NEW.organization_id OR c.treasury_outcome_id IS DISTINCT FROM NEW.treasury_outcome_id OR c.safe_observation_id IS DISTINCT FROM NEW.safe_observation_id OR es.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'counterfactual cost or Evidence lineage mismatch';END IF;
 RETURN NEW;
END;$$ LANGUAGE plpgsql;
CREATE TRIGGER treasury_counterfactual_lineage_guard BEFORE INSERT ON treasury_counterfactual_assessments FOR EACH ROW EXECUTE FUNCTION guard_treasury_counterfactual_assessment();
CREATE OR REPLACE FUNCTION prevent_treasury_counterfactual_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'treasury counterfactual assessments are immutable';END;$$ LANGUAGE plpgsql;
CREATE TRIGGER treasury_counterfactual_immutable BEFORE UPDATE OR DELETE ON treasury_counterfactual_assessments FOR EACH ROW EXECUTE FUNCTION prevent_treasury_counterfactual_mutation();
ALTER TABLE treasury_counterfactual_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON treasury_counterfactual_assessments USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON treasury_counterfactual_assessments TO aeos_app;
