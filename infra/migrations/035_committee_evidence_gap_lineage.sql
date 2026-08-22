ALTER TABLE decisions ADD COLUMN IF NOT EXISTS parent_decision_id text REFERENCES decisions(id);
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 0 CHECK(revision_number BETWEEN 0 AND 3);
CREATE UNIQUE INDEX IF NOT EXISTS decision_single_child_revision_idx ON decisions(organization_id,parent_decision_id) WHERE parent_decision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS decision_lineage_idx ON decisions(organization_id,parent_decision_id,revision_number,id);

CREATE TABLE decision_evidence_gaps(
 id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),decision_id text NOT NULL REFERENCES decisions(id),
 schema_version text NOT NULL CHECK(schema_version='committee.evidence-gap.v1'),code text NOT NULL CHECK(code IN('MISSING_EVIDENCE','STALE_EVIDENCE','CONFLICTING_EVIDENCE','LOW_QUALITY_EVIDENCE','UNSUPPORTED_CONTEXT')),
 source_blocker text NOT NULL,requesting_role text NOT NULL CHECK(requesting_role IN('Governor','Research','Strategy','Quant','Risk','Compliance','Portfolio','Treasury')),
 status text NOT NULL CHECK(status IN('REQUESTABLE','REFUSAL_ONLY')),gap_type text CHECK(gap_type IN('BALANCE','TRANSACTION','EVENT')),source_chain_id integer,subject text,
 rationale text NOT NULL,supporting_evidence_ids jsonb NOT NULL,gap_hash text NOT NULL,evidence_request_id text REFERENCES evidence_requests(id),
 child_decision_id text REFERENCES decisions(id),asset_execution_authorized boolean NOT NULL CHECK(asset_execution_authorized=false),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(decision_id,gap_hash),CHECK((status='REQUESTABLE' AND gap_type IS NOT NULL AND source_chain_id IN(11155111,80002) AND subject IS NOT NULL) OR(status='REFUSAL_ONLY' AND gap_type IS NULL AND source_chain_id IS NULL AND subject IS NULL))
);
CREATE INDEX decision_evidence_gap_org_decision_idx ON decision_evidence_gaps(organization_id,decision_id,created_at,id);
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS evidence_request_id text REFERENCES evidence_requests(id);

CREATE TABLE decision_evidence_gap_links(
 id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),decision_id text NOT NULL REFERENCES decisions(id),gap_id text NOT NULL REFERENCES decision_evidence_gaps(id),
 evidence_request_id text NOT NULL REFERENCES evidence_requests(id),agent_message_id text NOT NULL REFERENCES agent_messages(id),child_decision_id text REFERENCES decisions(id),
 link_hash text NOT NULL,asset_execution_authorized boolean NOT NULL CHECK(asset_execution_authorized=false),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(gap_id),UNIQUE(evidence_request_id)
);
CREATE INDEX decision_evidence_gap_link_org_decision_idx ON decision_evidence_gap_links(organization_id,decision_id,created_at,id);

CREATE OR REPLACE FUNCTION reject_decision_gap_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Decision Evidence gaps are immutable'; END $$;
CREATE TRIGGER decision_evidence_gap_immutable BEFORE UPDATE OR DELETE ON decision_evidence_gaps FOR EACH ROW EXECUTE FUNCTION reject_decision_gap_mutation();
CREATE OR REPLACE FUNCTION validate_decision_gap_refs() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM decisions WHERE id=NEW.decision_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Decision Evidence gap organization mismatch'; END IF;
 IF NEW.evidence_request_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM evidence_requests WHERE id=NEW.evidence_request_id AND decision_id=NEW.decision_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Decision Evidence request reference mismatch'; END IF;
 IF NEW.child_decision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM decisions WHERE id=NEW.child_decision_id AND parent_decision_id=NEW.decision_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Child Decision lineage mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.supporting_evidence_ids) e WHERE NOT EXISTS(SELECT 1 FROM evidence WHERE id=e AND organization_id=NEW.organization_id)) THEN RAISE EXCEPTION 'Decision Evidence gap supporting Evidence mismatch'; END IF;
 RETURN NEW;END $$;
CREATE TRIGGER decision_evidence_gap_refs BEFORE INSERT ON decision_evidence_gaps FOR EACH ROW EXECUTE FUNCTION validate_decision_gap_refs();
CREATE OR REPLACE FUNCTION validate_decision_gap_link_refs() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM decision_evidence_gaps WHERE id=NEW.gap_id AND decision_id=NEW.decision_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Decision Evidence gap link mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM evidence_requests WHERE id=NEW.evidence_request_id AND decision_id=NEW.decision_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Decision Evidence request link mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM agent_messages WHERE id=NEW.agent_message_id AND decision_id=NEW.decision_id AND organization_id=NEW.organization_id AND evidence_request_id=NEW.evidence_request_id) THEN RAISE EXCEPTION 'Decision A2A request link mismatch'; END IF;
 IF NEW.child_decision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM decisions WHERE id=NEW.child_decision_id AND parent_decision_id=NEW.decision_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Decision child link mismatch'; END IF;
 RETURN NEW;END $$;
CREATE TRIGGER decision_evidence_gap_link_refs BEFORE INSERT ON decision_evidence_gap_links FOR EACH ROW EXECUTE FUNCTION validate_decision_gap_link_refs();
CREATE TRIGGER decision_evidence_gap_link_immutable BEFORE UPDATE OR DELETE ON decision_evidence_gap_links FOR EACH ROW EXECUTE FUNCTION reject_decision_gap_mutation();
CREATE OR REPLACE FUNCTION validate_decision_lineage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.parent_decision_id IS NULL AND NEW.revision_number<>0 THEN RAISE EXCEPTION 'Root Decision revision must be zero'; END IF;
 IF NEW.parent_decision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM decisions p WHERE p.id=NEW.parent_decision_id AND p.organization_id=NEW.organization_id AND NEW.revision_number=p.revision_number+1) THEN RAISE EXCEPTION 'Decision lineage organization or revision mismatch'; END IF;
 RETURN NEW;END $$;
CREATE TRIGGER decision_lineage_guard BEFORE INSERT ON decisions FOR EACH ROW EXECUTE FUNCTION validate_decision_lineage();
CREATE OR REPLACE FUNCTION protect_decision_lineage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.parent_decision_id IS DISTINCT FROM OLD.parent_decision_id OR NEW.revision_number IS DISTINCT FROM OLD.revision_number THEN RAISE EXCEPTION 'Decision lineage is immutable'; END IF;RETURN NEW;END $$;
CREATE TRIGGER decision_lineage_immutable BEFORE UPDATE ON decisions FOR EACH ROW EXECUTE FUNCTION protect_decision_lineage();

ALTER TABLE decision_evidence_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON decision_evidence_gaps USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON decision_evidence_gaps TO aeos_app;
ALTER TABLE decision_evidence_gap_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON decision_evidence_gap_links USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON decision_evidence_gap_links TO aeos_app;
