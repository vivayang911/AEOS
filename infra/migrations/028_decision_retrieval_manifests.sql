ALTER TABLE decisions ADD COLUMN retrieval_bundle_hash text;

CREATE TABLE decision_retrieval_manifests (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  role text NOT NULL CHECK(role IN('Governor','Research','Strategy','Quant','Risk','Compliance','Portfolio','Treasury')),
  query text NOT NULL,
  query_hash text NOT NULL,
  status text NOT NULL CHECK(status IN('SUPPORTED','INSUFFICIENT_CONTEXT','REFUSED')),
  reason_code text,
  has_conflicts boolean NOT NULL,
  embedding_model text NOT NULL,
  reranker_version text NOT NULL,
  items jsonb NOT NULL,
  manifest_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision_id,role)
);
CREATE INDEX decision_retrieval_manifest_org_decision_idx ON decision_retrieval_manifests(organization_id,decision_id,role);

CREATE OR REPLACE FUNCTION reject_decision_retrieval_manifest_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'decision retrieval manifests are immutable'; END;
$$;
CREATE TRIGGER decision_retrieval_manifest_immutable BEFORE UPDATE OR DELETE ON decision_retrieval_manifests
FOR EACH ROW EXECUTE FUNCTION reject_decision_retrieval_manifest_mutation();

ALTER TABLE decision_retrieval_manifests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON decision_retrieval_manifests
USING (aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK (aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON decision_retrieval_manifests TO aeos_app;
