CREATE OR REPLACE FUNCTION validate_evidence_classification_shape() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_content_hash text; source_verification_status text;
BEGIN
  IF jsonb_typeof(NEW.labels)<>'array' OR jsonb_typeof(NEW.routes)<>'array' OR jsonb_typeof(NEW.reasons)<>'array' THEN RAISE EXCEPTION 'Evidence classification arrays are required'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.labels) item WHERE item NOT IN('LIQUIDITY','GROWTH','RISK','SECURITY','GOVERNANCE','TREASURY','PROTOCOL')) THEN RAISE EXCEPTION 'unknown Evidence classification label'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.routes) item WHERE item NOT IN('Governor','Research','Strategy','Quant','Risk','Compliance','Portfolio','Treasury')) THEN RAISE EXCEPTION 'unknown Evidence classification route'; END IF;
  SELECT content_hash,verification_status INTO source_content_hash,source_verification_status FROM evidence WHERE id=NEW.evidence_id AND organization_id=NEW.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evidence classification source organization mismatch'; END IF;
  IF NEW.evidence_content_hash<>source_content_hash THEN RAISE EXCEPTION 'Evidence classification content hash mismatch'; END IF;
  IF NEW.verification_status<>source_verification_status THEN RAISE EXCEPTION 'Evidence classification verification truth mismatch'; END IF;
  RETURN NEW;
END $$;
