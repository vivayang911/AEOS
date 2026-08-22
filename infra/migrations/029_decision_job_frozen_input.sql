CREATE OR REPLACE FUNCTION protect_decision_job_frozen_input() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.input IS DISTINCT FROM OLD.input OR NEW.input_hash IS DISTINCT FROM OLD.input_hash THEN
    RAISE EXCEPTION 'decision job frozen input is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER decision_job_frozen_input_immutable BEFORE UPDATE ON decision_jobs
FOR EACH ROW EXECUTE FUNCTION protect_decision_job_frozen_input();
