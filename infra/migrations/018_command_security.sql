ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS csrf_token_hash text;
UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),csrf_token_hash='revoked_'||id WHERE csrf_token_hash IS NULL;
ALTER TABLE auth_sessions ALTER COLUMN csrf_token_hash SET NOT NULL;

CREATE TABLE idempotency_records (
  id text PRIMARY KEY,
  scope_id text NOT NULL,
  organization_id text REFERENCES organizations(id),
  user_id text NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200),
  route text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL CHECK(state IN('IN_PROGRESS','COMPLETED')),
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(scope_id,idempotency_key)
);
CREATE INDEX idempotency_records_expiry_idx ON idempotency_records(expires_at);
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY idempotency_identity_isolation ON idempotency_records
USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id() OR (organization_id IS NULL AND user_id=aeos_current_user_id()))
WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id() OR (organization_id IS NULL AND user_id=aeos_current_user_id()));

CREATE TABLE request_rate_limits (
  key_hash text NOT NULL,
  bucket_start timestamptz NOT NULL,
  count integer NOT NULL CHECK(count>0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(key_hash,bucket_start)
);
CREATE INDEX request_rate_limits_expiry_idx ON request_rate_limits(expires_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON idempotency_records,request_rate_limits TO aeos_app;
