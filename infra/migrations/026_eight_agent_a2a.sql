CREATE TABLE IF NOT EXISTS agent_messages (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  decision_id text NOT NULL REFERENCES decisions(id),
  ordinal integer NOT NULL CHECK(ordinal >= 0),
  round integer NOT NULL CHECK(round > 0),
  sender_role text NOT NULL CHECK(sender_role IN('Governor','Research','Strategy','Quant','Risk','Compliance','Portfolio','Treasury')),
  recipient_role text NOT NULL CHECK(recipient_role IN('Governor','Research','Strategy','Quant','Risk','Compliance','Portfolio','Treasury')),
  message_type text NOT NULL CHECK(message_type IN('REQUEST','RESPONSE','CHALLENGE','RESOLUTION','HANDOFF','DECISION')),
  code text NOT NULL,
  content text NOT NULL,
  evidence_ids jsonb NOT NULL,
  input_hash text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(sender_role <> recipient_role),
  UNIQUE(decision_id,ordinal)
);
CREATE INDEX IF NOT EXISTS agent_messages_org_decision_idx ON agent_messages(organization_id,decision_id,ordinal,id);

CREATE OR REPLACE FUNCTION reject_agent_message_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'agent messages are immutable'; END;
$$;
DROP TRIGGER IF EXISTS agent_message_immutable ON agent_messages;
CREATE TRIGGER agent_message_immutable BEFORE UPDATE OR DELETE ON agent_messages
FOR EACH ROW EXECUTE FUNCTION reject_agent_message_mutation();

ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_organization_isolation ON agent_messages;
CREATE POLICY tenant_organization_isolation ON agent_messages
USING (aeos_is_system_worker() OR organization_id=aeos_current_organization_id())
WITH CHECK (aeos_is_system_worker() OR organization_id=aeos_current_organization_id());

GRANT SELECT,INSERT,UPDATE,DELETE ON agent_messages TO aeos_app;
