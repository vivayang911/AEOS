CREATE TABLE alerts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  source_event_id text NOT NULL,
  source_event_type text NOT NULL,
  severity text NOT NULL CHECK(severity IN('MEDIUM','HIGH','CRITICAL')),
  category text NOT NULL,
  rule_version text NOT NULL,
  title_code text NOT NULL,
  details jsonb NOT NULL,
  content_hash text NOT NULL,
  notification_adapter text NOT NULL DEFAULT 'mock-local-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id),
  UNIQUE(organization_id,source_event_id),
  FOREIGN KEY(source_event_id,organization_id) REFERENCES outbox_events(id,organization_id)
);
CREATE INDEX alerts_org_created_idx ON alerts(organization_id,created_at DESC,id DESC);
CREATE INDEX alerts_org_severity_idx ON alerts(organization_id,severity,created_at DESC);

CREATE TABLE alert_acknowledgements (
  id text PRIMARY KEY,
  alert_id text NOT NULL,
  organization_id text NOT NULL,
  acknowledged_by text NOT NULL REFERENCES users(id),
  note text,
  note_hash text NOT NULL,
  request_id text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(alert_id,organization_id) REFERENCES alerts(id,organization_id)
);
CREATE INDEX alert_ack_org_alert_idx ON alert_acknowledgements(organization_id,alert_id,acknowledged_at,id);

CREATE OR REPLACE FUNCTION prevent_alert_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'alerts are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER alert_immutable BEFORE UPDATE OR DELETE ON alerts
FOR EACH ROW EXECUTE FUNCTION prevent_alert_mutation();

CREATE OR REPLACE FUNCTION prevent_alert_ack_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'alert acknowledgements are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER alert_ack_immutable BEFORE UPDATE OR DELETE ON alert_acknowledgements
FOR EACH ROW EXECUTE FUNCTION prevent_alert_ack_mutation();

CREATE OR REPLACE FUNCTION enqueue_audit_outbox_event() RETURNS trigger AS $$
DECLARE event_id text := 'evt_'||NEW.id;
BEGIN
  INSERT INTO outbox_events(id,organization_id,type,occurred_at,actor,object_ref,data,schema_version,request_id,content_hash)
  VALUES(event_id,NEW.organization_id,NEW.event_type,NEW.created_at,NEW.actor,jsonb_build_object('type',NEW.object_type,'id',NEW.object_id),NEW.data,NEW.schema_version,NEW.request_id,NEW.payload_hash);
  INSERT INTO outbox_deliveries(event_id,organization_id,consumer) VALUES
    (event_id,NEW.organization_id,'mock-observer-v1'),
    (event_id,NEW.organization_id,'alert-rules-v1');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO outbox_deliveries(event_id,organization_id,consumer)
SELECT id,organization_id,'alert-rules-v1' FROM outbox_events
ON CONFLICT(event_id,consumer) DO NOTHING;

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON alerts USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
CREATE POLICY tenant_organization_isolation ON alert_acknowledgements USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON alerts,alert_acknowledgements TO aeos_app;
