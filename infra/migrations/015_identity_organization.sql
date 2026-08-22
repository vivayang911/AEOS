ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_status_check CHECK(status IN('ACTIVE','SUSPENDED','ARCHIVED'));

-- Normalize the forward-compatible audit schema used by all services.
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS action text;
UPDATE audit_events SET action=event_type WHERE action IS NULL;
ALTER TABLE audit_events ALTER COLUMN action SET NOT NULL;

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit events are append-only'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_event_append_only ON audit_events;
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  wallet_address text NOT NULL UNIQUE CHECK(wallet_address=lower(wallet_address)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  user_id text NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK(role IN('ADMIN','TREASURY_COMMITTEE','REVIEWER','OPERATOR','AUDITOR','GUARDIAN')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','SUSPENDED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_status_idx ON memberships(user_id,status,organization_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id text PRIMARY KEY,
  wallet_address text NOT NULL CHECK(wallet_address=lower(wallet_address)),
  chain_id integer NOT NULL CHECK(chain_id>0),
  nonce text NOT NULL UNIQUE,
  message_hash text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at>issued_at)
);
CREATE INDEX IF NOT EXISTS auth_challenges_wallet_expiry_idx ON auth_challenges(wallet_address,expires_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  active_organization_id text REFERENCES organizations(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_expiry_idx ON auth_sessions(user_id,expires_at DESC);
