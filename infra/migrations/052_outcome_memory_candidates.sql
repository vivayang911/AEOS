CREATE TABLE outcome_memory_candidates(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id),
 treasury_outcome_id text NOT NULL REFERENCES treasury_outcome_assessments(id),
 counterfactual_assessment_id text NOT NULL REFERENCES treasury_counterfactual_assessments(id),
 review_mode text NOT NULL CHECK(review_mode IN('HUMAN_COMMITTEE','HUMAN_COMMITTEE_AND_DAO')),
 lesson text NOT NULL CHECK(length(lesson) BETWEEN 10 AND 5000),
 invalidation_conditions jsonb NOT NULL CHECK(jsonb_typeof(invalidation_conditions)='array' AND jsonb_array_length(invalidation_conditions)>0),
 acl_roles jsonb NOT NULL CHECK(jsonb_typeof(acl_roles)='array' AND jsonb_array_length(acl_roles)>0),
 valid_until timestamptz,
 source_lineage jsonb NOT NULL,
 content_hash text NOT NULL CHECK(content_hash~'^0x[0-9a-f]{64}$'),
 created_by text NOT NULL,
 claim_classification text NOT NULL DEFAULT 'NON_CAUSAL_OPERATING_LESSON' CHECK(claim_classification='NON_CAUSAL_OPERATING_LESSON'),
 historical_performance_claimed boolean NOT NULL DEFAULT false CHECK(historical_performance_claimed=false),
 causal_attribution_established boolean NOT NULL DEFAULT false CHECK(causal_attribution_established=false),
 automatic_promotion_authorized boolean NOT NULL DEFAULT false CHECK(automatic_promotion_authorized=false),
 skill_promotion_authorized boolean NOT NULL DEFAULT false CHECK(skill_promotion_authorized=false),
 asset_execution_authorized boolean NOT NULL DEFAULT false CHECK(asset_execution_authorized=false),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,treasury_outcome_id,counterfactual_assessment_id,content_hash)
);
CREATE INDEX outcome_memory_candidates_org_created_idx ON outcome_memory_candidates(organization_id,created_at DESC,id DESC);

CREATE TABLE outcome_memory_candidate_reviews(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id),
 candidate_id text NOT NULL REFERENCES outcome_memory_candidates(id),
 reviewer_id text NOT NULL,
 reviewer_role text NOT NULL CHECK(reviewer_role IN('REVIEWER','TREASURY_COMMITTEE')),
 outcome text NOT NULL CHECK(outcome IN('APPROVE','REJECT')),
 rationale text NOT NULL CHECK(length(rationale) BETWEEN 3 AND 2000),
 payload_hash text NOT NULL CHECK(payload_hash~'^0x[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,candidate_id,reviewer_id),
 UNIQUE(organization_id,candidate_id,reviewer_role)
);

CREATE TABLE outcome_memory_candidate_events(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id),
 candidate_id text NOT NULL REFERENCES outcome_memory_candidates(id),
 ordinal integer NOT NULL CHECK(ordinal>=0),
 event_type text NOT NULL CHECK(event_type IN('CANDIDATE','REVIEW_RECORDED','HUMAN_APPROVED','DAO_CONFIRMED','PROMOTED','REJECTED')),
 actor jsonb NOT NULL,
 data jsonb NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash~'^0x[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,candidate_id,ordinal)
);

CREATE TABLE outcome_memory_promotions(
 id text PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id),
 candidate_id text NOT NULL REFERENCES outcome_memory_candidates(id),
 memory_id text NOT NULL REFERENCES organization_memories(id),
 promoted_by text NOT NULL,
 content_hash text NOT NULL CHECK(content_hash~'^0x[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,candidate_id),
 UNIQUE(organization_id,memory_id)
);

CREATE OR REPLACE FUNCTION validate_outcome_memory_candidate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM treasury_outcome_assessments o JOIN treasury_counterfactual_assessments c ON c.organization_id=o.organization_id AND c.treasury_outcome_id=o.id WHERE o.organization_id=NEW.organization_id AND o.id=NEW.treasury_outcome_id AND c.id=NEW.counterfactual_assessment_id) THEN RAISE EXCEPTION 'outcome memory candidate lineage mismatch'; END IF;
 IF NEW.valid_until IS NOT NULL AND NEW.valid_until<=NEW.created_at THEN RAISE EXCEPTION 'outcome memory candidate validity is expired'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER outcome_memory_candidate_guard BEFORE INSERT ON outcome_memory_candidates FOR EACH ROW EXECUTE FUNCTION validate_outcome_memory_candidate();

CREATE OR REPLACE FUNCTION validate_outcome_memory_review() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE creator text; BEGIN
 SELECT created_by INTO creator FROM outcome_memory_candidates WHERE id=NEW.candidate_id AND organization_id=NEW.organization_id;
 IF creator IS NULL THEN RAISE EXCEPTION 'outcome memory review tenant mismatch'; END IF;
 IF creator=NEW.reviewer_id THEN RAISE EXCEPTION 'outcome memory candidate creator cannot review'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER outcome_memory_review_guard BEFORE INSERT ON outcome_memory_candidate_reviews FOR EACH ROW EXECUTE FUNCTION validate_outcome_memory_review();

CREATE OR REPLACE FUNCTION validate_outcome_memory_event() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE prior text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM outcome_memory_candidates WHERE id=NEW.candidate_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'outcome memory event tenant mismatch'; END IF;
 IF NEW.ordinal=0 THEN IF NEW.event_type<>'CANDIDATE' THEN RAISE EXCEPTION 'outcome memory candidate must start as CANDIDATE'; END IF; RETURN NEW; END IF;
 SELECT event_type INTO prior FROM outcome_memory_candidate_events WHERE organization_id=NEW.organization_id AND candidate_id=NEW.candidate_id AND ordinal=NEW.ordinal-1;
 IF prior IS NULL THEN RAISE EXCEPTION 'outcome memory event sequence gap'; END IF;
 IF NOT ((prior IN('CANDIDATE','REVIEW_RECORDED') AND NEW.event_type IN('REVIEW_RECORDED','HUMAN_APPROVED','REJECTED')) OR (prior='HUMAN_APPROVED' AND NEW.event_type IN('DAO_CONFIRMED','PROMOTED')) OR (prior='DAO_CONFIRMED' AND NEW.event_type='PROMOTED')) THEN RAISE EXCEPTION 'outcome memory event transition invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER outcome_memory_event_guard BEFORE INSERT ON outcome_memory_candidate_events FOR EACH ROW EXECUTE FUNCTION validate_outcome_memory_event();

CREATE OR REPLACE FUNCTION validate_outcome_memory_promotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM outcome_memory_candidates c JOIN organization_memories m ON m.id=NEW.memory_id AND m.organization_id=c.organization_id WHERE c.id=NEW.candidate_id AND c.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'outcome memory promotion tenant mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER outcome_memory_promotion_guard BEFORE INSERT ON outcome_memory_promotions FOR EACH ROW EXECUTE FUNCTION validate_outcome_memory_promotion();

CREATE OR REPLACE FUNCTION prevent_outcome_memory_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'outcome memory governance records are immutable'; END $$;
CREATE TRIGGER outcome_memory_candidate_immutable BEFORE UPDATE OR DELETE ON outcome_memory_candidates FOR EACH ROW EXECUTE FUNCTION prevent_outcome_memory_mutation();
CREATE TRIGGER outcome_memory_review_immutable BEFORE UPDATE OR DELETE ON outcome_memory_candidate_reviews FOR EACH ROW EXECUTE FUNCTION prevent_outcome_memory_mutation();
CREATE TRIGGER outcome_memory_event_immutable BEFORE UPDATE OR DELETE ON outcome_memory_candidate_events FOR EACH ROW EXECUTE FUNCTION prevent_outcome_memory_mutation();
CREATE TRIGGER outcome_memory_promotion_immutable BEFORE UPDATE OR DELETE ON outcome_memory_promotions FOR EACH ROW EXECUTE FUNCTION prevent_outcome_memory_mutation();

DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['outcome_memory_candidates','outcome_memory_candidate_reviews','outcome_memory_candidate_events','outcome_memory_promotions'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
 EXECUTE format('CREATE POLICY tenant_organization_isolation ON %I USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id())',table_name);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO aeos_app',table_name);
END LOOP; END $$;
