CREATE OR REPLACE FUNCTION notify_cockpit_projection_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'aeos_cockpit_projection_v1',
    json_build_object(
      'schemaVersion','aeos.cockpit.wakeup.v1',
      'organizationId',NEW.organization_id,
      'eventId',NEW.id
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_cockpit_projection_notify
AFTER INSERT ON audit_events
FOR EACH ROW EXECUTE FUNCTION notify_cockpit_projection_change();
