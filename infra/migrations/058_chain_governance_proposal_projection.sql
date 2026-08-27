CREATE TABLE chain_governance_proposals (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
  governance_outcome_evidence_id text NOT NULL REFERENCES governance_outcome_evidence(id),
  proposal_type text NOT NULL CHECK(proposal_type IN('SECURITY_HOLD')),
  title text NOT NULL,
  state text NOT NULL CHECK(state IN('EXECUTED')),
  chain_id integer NOT NULL CHECK(chain_id>0),
  governor text NOT NULL CHECK(governor~'^0x[0-9a-f]{40}$'),
  external_proposal_id text NOT NULL CHECK(external_proposal_id~'^[0-9]+$'),
  targets jsonb NOT NULL CHECK(jsonb_typeof(targets)='array' AND jsonb_array_length(targets)>0),
  values_json jsonb NOT NULL CHECK(jsonb_typeof(values_json)='array'),
  calldatas jsonb NOT NULL CHECK(jsonb_typeof(calldatas)='array'),
  calldata_hash text NOT NULL CHECK(calldata_hash~'^0x[0-9a-f]{64}$'),
  proposal_artifact_hash text NOT NULL CHECK(proposal_artifact_hash~'^0x[0-9a-f]{64}$'),
  proposal_transaction_hash text NOT NULL CHECK(proposal_transaction_hash~'^0x[0-9a-f]{64}$'),
  vote_transaction_hash text NOT NULL CHECK(vote_transaction_hash~'^0x[0-9a-f]{64}$'),
  queue_transaction_hash text NOT NULL CHECK(queue_transaction_hash~'^0x[0-9a-f]{64}$'),
  execute_transaction_hash text NOT NULL CHECK(execute_transaction_hash~'^0x[0-9a-f]{64}$'),
  final_block_number bigint NOT NULL CHECK(final_block_number>=0),
  final_block_hash text NOT NULL CHECK(final_block_hash~'^0x[0-9a-f]{64}$'),
  confirmations integer NOT NULL CHECK(confirmations>=0),
  payload jsonb NOT NULL,
  content_hash text NOT NULL CHECK(content_hash~'^0x[0-9a-f]{64}$'),
  asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,external_proposal_id),
  UNIQUE(organization_id,content_hash),
  UNIQUE(governance_outcome_evidence_id)
);

CREATE INDEX chain_governance_proposals_org_created_idx
  ON chain_governance_proposals(organization_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION validate_chain_governance_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d decisions%ROWTYPE; s evidence_snapshots%ROWTYPE; o governance_outcome_evidence%ROWTYPE;
BEGIN
  SELECT * INTO d FROM decisions WHERE id=NEW.decision_id;
  SELECT * INTO s FROM evidence_snapshots WHERE id=NEW.evidence_snapshot_id;
  SELECT * INTO o FROM governance_outcome_evidence WHERE id=NEW.governance_outcome_evidence_id;
  IF d.id IS NULL OR s.id IS NULL OR o.id IS NULL OR
     d.organization_id IS DISTINCT FROM NEW.organization_id OR
     s.organization_id IS DISTINCT FROM NEW.organization_id OR
     o.organization_id IS DISTINCT FROM NEW.organization_id OR
     d.evidence_snapshot_id IS DISTINCT FROM NEW.evidence_snapshot_id OR
     o.decision_id IS DISTINCT FROM NEW.decision_id OR
     o.evidence_snapshot_id IS DISTINCT FROM NEW.evidence_snapshot_id OR
     o.external_proposal_id IS DISTINCT FROM NEW.external_proposal_id OR
     o.transaction_hash IS DISTINCT FROM NEW.execute_transaction_hash OR
     jsonb_array_length(NEW.targets)<>jsonb_array_length(NEW.values_json) OR
     jsonb_array_length(NEW.targets)<>jsonb_array_length(NEW.calldatas) THEN
    RAISE EXCEPTION 'chain governance Proposal tenant, lineage, execution, or action mismatch';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER chain_governance_proposal_lineage_guard BEFORE INSERT ON chain_governance_proposals
FOR EACH ROW EXECUTE FUNCTION validate_chain_governance_proposal();

CREATE OR REPLACE FUNCTION reject_chain_governance_proposal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'chain governance Proposal projection is immutable; append canonical source evidence'; END $$;

CREATE TRIGGER chain_governance_proposal_immutable BEFORE UPDATE OR DELETE ON chain_governance_proposals
FOR EACH ROW EXECUTE FUNCTION reject_chain_governance_proposal_mutation();

ALTER TABLE chain_governance_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON chain_governance_proposals
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON chain_governance_proposals TO aeos_app;
