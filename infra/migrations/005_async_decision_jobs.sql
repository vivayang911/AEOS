CREATE TABLE IF NOT EXISTS decision_jobs (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  idempotency_key text NOT NULL,
  input jsonb NOT NULL,
  input_hash text NOT NULL,
  status text NOT NULL CHECK(status IN('QUEUED','RUNNING','COMPLETED','FAILED','TIMED_OUT')),
  current_stage text NOT NULL,
  progress integer NOT NULL CHECK(progress BETWEEN 0 AND 100),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2 CHECK(max_attempts BETWEEN 1 AND 5),
  lease_owner text,
  lease_expires_at timestamptz,
  decision_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS decision_jobs_claim_idx ON decision_jobs(status,lease_expires_at,created_at);
CREATE INDEX IF NOT EXISTS decision_jobs_org_created_idx ON decision_jobs(organization_id,created_at DESC,id DESC);

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS job_id text REFERENCES decision_jobs(id);
CREATE UNIQUE INDEX IF NOT EXISTS decisions_job_id_unique_idx ON decisions(job_id) WHERE job_id IS NOT NULL;
