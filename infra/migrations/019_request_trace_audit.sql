ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_id text
  DEFAULT nullif(current_setting('app.current_request_id',true),'');
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_request_id_format;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_request_id_format
  CHECK(request_id IS NULL OR request_id ~ '^(req_[a-f0-9]{32}|[A-Za-z0-9][A-Za-z0-9._:-]{0,99})$');
CREATE INDEX IF NOT EXISTS audit_events_org_request_idx ON audit_events(organization_id,request_id) WHERE request_id IS NOT NULL;
