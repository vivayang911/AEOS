DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aeos_app') THEN
    CREATE ROLE aeos_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT aeos_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO aeos_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO aeos_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO aeos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO aeos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO aeos_app;

CREATE OR REPLACE FUNCTION aeos_current_organization_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_organization_id',true),'') $$;
CREATE OR REPLACE FUNCTION aeos_current_user_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_user_id',true),'') $$;
CREATE OR REPLACE FUNCTION aeos_current_membership_role() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_membership_role',true),'') $$;
CREATE OR REPLACE FUNCTION aeos_is_system_worker() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT current_setting('app.system_worker',true)='on' $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'raw_attestations','evidence','evidence_quarantine','evidence_snapshots','audit_events',
    'policy_versions','decisions','agent_runs','decision_claims','decision_challenges','decision_reviews',
    'decision_jobs','attestcoin_proof_jobs','policy_simulations','proposals','proposal_state_observations',
    'execution_preflights','safe_transaction_observations','execution_reconciliation_attempts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_organization_isolation ON %I',table_name);
    EXECUTE format(
      'CREATE POLICY tenant_organization_isolation ON %I USING (aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK (aeos_is_system_worker() OR organization_id=aeos_current_organization_id())',
      table_name
    );
  END LOOP;
END $$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_membership_isolation ON organizations;
CREATE POLICY organization_membership_isolation ON organizations
USING (
  aeos_is_system_worker()
  OR id=aeos_current_organization_id()
  OR EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id=organizations.id AND m.user_id=aeos_current_user_id() AND m.status='ACTIVE'
  )
)
WITH CHECK (aeos_is_system_worker() OR id=aeos_current_organization_id());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_identity_isolation ON memberships;
CREATE POLICY membership_identity_isolation ON memberships
USING (
  aeos_is_system_worker()
  OR user_id=aeos_current_user_id()
  OR (organization_id=aeos_current_organization_id() AND aeos_current_membership_role() IN('ADMIN','AUDITOR'))
)
WITH CHECK (
  aeos_is_system_worker()
  OR (organization_id=aeos_current_organization_id() AND aeos_current_membership_role()='ADMIN')
);
