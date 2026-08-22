ALTER TABLE decisions ADD COLUMN IF NOT EXISTS citation_coverage jsonb NOT NULL DEFAULT '{"totalClaims":0,"materialClaims":0,"citedMaterialClaims":0,"coverage":1}'::jsonb;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS orchestration jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS run_state text NOT NULL DEFAULT 'SUCCEEDED';
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS budget_usage jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS decision_claims (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  ordinal integer NOT NULL,
  text text NOT NULL,
  materiality text NOT NULL CHECK(materiality IN('MATERIAL','SUPPORTING')),
  confidence numeric(5,4) NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  evidence_ids jsonb NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision_id,ordinal)
);
CREATE INDEX IF NOT EXISTS decision_claims_org_decision_idx ON decision_claims(organization_id,decision_id,ordinal);

CREATE TABLE IF NOT EXISTS decision_challenges (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  round integer NOT NULL,
  raised_by text NOT NULL,
  target_role text NOT NULL,
  code text NOT NULL,
  challenge text NOT NULL,
  response text NOT NULL,
  status text NOT NULL CHECK(status IN('RESOLVED','UNRESOLVED')),
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decision_challenges_org_decision_idx ON decision_challenges(organization_id,decision_id,round,id);

CREATE TABLE IF NOT EXISTS decision_reviews (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  outcome text NOT NULL CHECK(outcome IN('APPROVED','REJECTED')),
  actor_id text NOT NULL,
  rationale text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision_id)
);
CREATE INDEX IF NOT EXISTS decision_reviews_org_decision_idx ON decision_reviews(organization_id,decision_id,created_at DESC);
