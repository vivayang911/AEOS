CREATE TABLE knowledge_sources (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), source_key text NOT NULL,
  partition text NOT NULL CHECK(partition IN('VERIFIED_EVIDENCE','GOVERNANCE','PROTOCOL','DECISION_MEMORY')),
  version integer NOT NULL CHECK(version>0), title text NOT NULL, redacted_content text,
  acl_roles jsonb NOT NULL, valid_from timestamptz NOT NULL, valid_until timestamptz,
  supersedes_source_id text REFERENCES knowledge_sources(id), conflict_group_id text, created_by text NOT NULL,
  scan_result jsonb NOT NULL, original_content_hash text NOT NULL, content_hash text NOT NULL,
  embedding_model text NOT NULL DEFAULT 'deterministic-hash-embedding-v1-mock-only', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,source_key,version), CHECK(valid_until IS NULL OR valid_until>valid_from)
);
CREATE TABLE knowledge_source_events (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), source_id text NOT NULL REFERENCES knowledge_sources(id),
  ordinal integer NOT NULL, status text NOT NULL CHECK(status IN('DRAFT','QUARANTINED','APPROVED','RETIRED','DELETION_REQUESTED','DELETED')),
  actor_id text NOT NULL, rationale text NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,ordinal)
);
CREATE TABLE knowledge_chunks (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), source_id text NOT NULL REFERENCES knowledge_sources(id),
  source_version integer NOT NULL, chunk_index integer NOT NULL, heading text NOT NULL, content text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple',heading||' '||content)) STORED,
  embedding vector(16) NOT NULL, embedding_model text NOT NULL, acl_roles jsonb NOT NULL,
  valid_from timestamptz NOT NULL, valid_until timestamptz, conflict_group_id text, content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,chunk_index)
);
CREATE TABLE organization_memories (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), memory_type text NOT NULL CHECK(memory_type IN('WORKING','EVENT','ENTERPRISE')),
  content text NOT NULL, source_refs jsonb NOT NULL, acl_roles jsonb NOT NULL, valid_until timestamptz,
  supersedes_memory_id text REFERENCES organization_memories(id), author_id text NOT NULL, content_hash text NOT NULL,
  embedding vector(16) NOT NULL, embedding_model text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memory_events (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), memory_id text NOT NULL REFERENCES organization_memories(id),
  ordinal integer NOT NULL, status text NOT NULL CHECK(status IN('CANDIDATE','APPROVED','REJECTED','EXPIRED','SUPERSEDED','DELETION_REQUESTED','DELETED')),
  actor_id text NOT NULL, rationale text NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(memory_id,ordinal)
);
CREATE INDEX knowledge_source_lookup_idx ON knowledge_sources(organization_id,source_key,version DESC);
CREATE INDEX knowledge_chunk_source_idx ON knowledge_chunks(organization_id,source_id,chunk_index);
CREATE INDEX knowledge_chunk_search_idx ON knowledge_chunks USING gin(search_vector);
CREATE INDEX knowledge_chunk_embedding_idx ON knowledge_chunks USING hnsw(embedding vector_cosine_ops);
CREATE INDEX organization_memory_idx ON organization_memories(organization_id,created_at DESC,id);

CREATE OR REPLACE FUNCTION reject_rag_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'RAG and memory records are immutable'; END $$;
CREATE TRIGGER knowledge_source_immutable BEFORE UPDATE OR DELETE ON knowledge_sources FOR EACH ROW EXECUTE FUNCTION reject_rag_record_mutation();
CREATE TRIGGER knowledge_source_event_immutable BEFORE UPDATE OR DELETE ON knowledge_source_events FOR EACH ROW EXECUTE FUNCTION reject_rag_record_mutation();
CREATE TRIGGER knowledge_chunk_immutable BEFORE UPDATE OR DELETE ON knowledge_chunks FOR EACH ROW EXECUTE FUNCTION reject_rag_record_mutation();
CREATE TRIGGER organization_memory_immutable BEFORE UPDATE OR DELETE ON organization_memories FOR EACH ROW EXECUTE FUNCTION reject_rag_record_mutation();
CREATE TRIGGER memory_event_immutable BEFORE UPDATE OR DELETE ON memory_events FOR EACH ROW EXECUTE FUNCTION reject_rag_record_mutation();

DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['knowledge_sources','knowledge_source_events','knowledge_chunks','organization_memories','memory_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_organization_isolation ON %I USING (aeos_is_system_worker() OR organization_id=aeos_current_organization_id()) WITH CHECK (aeos_is_system_worker() OR organization_id=aeos_current_organization_id())',table_name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO aeos_app',table_name);
END LOOP; END $$;
