CREATE TABLE IF NOT EXISTS policy_versions (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), version integer NOT NULL,
  config jsonb NOT NULL, content_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,version)
);
CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), objective text NOT NULL,
  policy_version_id text NOT NULL REFERENCES policy_versions(id), evidence_snapshot_id text NOT NULL REFERENCES evidence_snapshots(id),
  provider text NOT NULL, schema_version text NOT NULL, status text NOT NULL,
  recommendation jsonb NOT NULL, input_hash text NOT NULL, output_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_org_created_idx ON decisions(organization_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS agent_runs (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), decision_id text NOT NULL REFERENCES decisions(id),
  role text NOT NULL, model_version text NOT NULL, tool_permissions jsonb NOT NULL,
  input_hash text NOT NULL, output jsonb NOT NULL, output_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision_id,role)
);
