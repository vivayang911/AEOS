CREATE TABLE evidence_classifications (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  evidence_id text NOT NULL REFERENCES evidence(id),
  schema_version text NOT NULL CHECK(schema_version='evidence.classification.v1'),
  classifier_version text NOT NULL,
  evidence_content_hash text NOT NULL,
  verification_status text NOT NULL CHECK(verification_status IN('VERIFIED','REJECTED','UNVERIFIED')),
  labels jsonb NOT NULL,
  routes jsonb NOT NULL,
  reasons jsonb NOT NULL,
  classification_hash text NOT NULL,
  asset_execution_authorized boolean NOT NULL CHECK(asset_execution_authorized=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evidence_id,classifier_version)
);
CREATE INDEX evidence_classification_org_evidence_idx ON evidence_classifications(organization_id,evidence_id,created_at DESC);

CREATE OR REPLACE FUNCTION validate_evidence_classification_shape() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.labels) item WHERE item NOT IN('LIQUIDITY','GROWTH','RISK','SECURITY','GOVERNANCE','TREASURY','PROTOCOL')) THEN RAISE EXCEPTION 'unknown Evidence classification label'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.routes) item WHERE item NOT IN('Governor','Research','Strategy','Quant','Risk','Compliance','Portfolio','Treasury')) THEN RAISE EXCEPTION 'unknown Evidence classification route'; END IF;
  IF NEW.evidence_content_hash<>(SELECT content_hash FROM evidence WHERE id=NEW.evidence_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Evidence classification content hash mismatch'; END IF;
  IF NEW.verification_status<>(SELECT verification_status FROM evidence WHERE id=NEW.evidence_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Evidence classification verification truth mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evidence_classification_shape BEFORE INSERT ON evidence_classifications FOR EACH ROW EXECUTE FUNCTION validate_evidence_classification_shape();
CREATE OR REPLACE FUNCTION reject_evidence_classification_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Evidence classifications are immutable'; END $$;
CREATE TRIGGER evidence_classification_immutable BEFORE UPDATE OR DELETE ON evidence_classifications FOR EACH ROW EXECUTE FUNCTION reject_evidence_classification_mutation();

ALTER TABLE evidence_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON evidence_classifications
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON evidence_classifications TO aeos_app;
