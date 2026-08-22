CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  actor jsonb NOT NULL,
  object_ref jsonb NOT NULL,
  data jsonb NOT NULL,
  schema_version text NOT NULL,
  request_id text,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id)
);
CREATE INDEX outbox_events_org_occurred_idx ON outbox_events(organization_id,occurred_at,id);

CREATE TABLE outbox_deliveries (
  event_id text NOT NULL,
  organization_id text NOT NULL,
  consumer text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','CLAIMED','DELIVERED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  claim_token text,
  lease_expires_at timestamptz,
  provider_request_id text,
  receipt_hash text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  PRIMARY KEY(event_id,consumer),
  FOREIGN KEY(event_id,organization_id) REFERENCES outbox_events(id,organization_id),
  CHECK((status='CLAIMED')=(lease_expires_at IS NOT NULL AND claim_token IS NOT NULL)),
  CHECK((status='DELIVERED')=(delivered_at IS NOT NULL)),
  CHECK(status='DELIVERED' OR provider_request_id IS NULL)
);
CREATE INDEX outbox_deliveries_claim_idx ON outbox_deliveries(consumer,status,lease_expires_at,created_at);

CREATE TABLE outbox_consumer_receipts (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  organization_id text NOT NULL,
  consumer text NOT NULL,
  provider_request_id text NOT NULL,
  receipt_hash text NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,consumer),
  FOREIGN KEY(event_id,organization_id) REFERENCES outbox_events(id,organization_id)
);

CREATE OR REPLACE FUNCTION prevent_outbox_event_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'outbox events are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER outbox_event_immutable BEFORE UPDATE OR DELETE ON outbox_events
FOR EACH ROW EXECUTE FUNCTION prevent_outbox_event_mutation();

CREATE OR REPLACE FUNCTION restrict_outbox_delivery_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'outbox deliveries cannot be deleted'; END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.consumer IS DISTINCT FROM OLD.consumer
    OR OLD.status='DELIVERED' OR (OLD.status='PENDING' AND NEW.status NOT IN('PENDING','CLAIMED'))
    OR (OLD.status='FAILED' AND NEW.status NOT IN('FAILED','CLAIMED')) OR (OLD.status='CLAIMED' AND NEW.status NOT IN('CLAIMED','DELIVERED','FAILED'))
  THEN RAISE EXCEPTION 'outbox delivery transition is not permitted'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER outbox_delivery_restricted BEFORE UPDATE OR DELETE ON outbox_deliveries
FOR EACH ROW EXECUTE FUNCTION restrict_outbox_delivery_mutation();

CREATE OR REPLACE FUNCTION prevent_outbox_receipt_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'outbox consumer receipts are immutable'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER outbox_receipt_immutable BEFORE UPDATE OR DELETE ON outbox_consumer_receipts
FOR EACH ROW EXECUTE FUNCTION prevent_outbox_receipt_mutation();

CREATE OR REPLACE FUNCTION enqueue_audit_outbox_event() RETURNS trigger AS $$
DECLARE event_id text := 'evt_'||NEW.id;
BEGIN
  INSERT INTO outbox_events(id,organization_id,type,occurred_at,actor,object_ref,data,schema_version,request_id,content_hash)
  VALUES(event_id,NEW.organization_id,NEW.event_type,NEW.created_at,NEW.actor,jsonb_build_object('type',NEW.object_type,'id',NEW.object_id),NEW.data,NEW.schema_version,NEW.request_id,NEW.payload_hash);
  INSERT INTO outbox_deliveries(event_id,organization_id,consumer) VALUES(event_id,NEW.organization_id,'mock-observer-v1');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_event_transactional_outbox AFTER INSERT ON audit_events
FOR EACH ROW EXECUTE FUNCTION enqueue_audit_outbox_event();

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_consumer_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organization_isolation ON outbox_events USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
CREATE POLICY tenant_organization_isolation ON outbox_deliveries USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
CREATE POLICY tenant_organization_isolation ON outbox_consumer_receipts USING(aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK(aeos_is_system_worker() OR organization_id=aeos_current_organization_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON outbox_events,outbox_deliveries,outbox_consumer_receipts TO aeos_app;
