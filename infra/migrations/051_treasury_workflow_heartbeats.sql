ALTER TABLE treasury_workflows ADD COLUMN heartbeat_at timestamptz;
CREATE INDEX treasury_workflows_running_heartbeat_idx ON treasury_workflows(status,heartbeat_at) WHERE status='RUNNING';
