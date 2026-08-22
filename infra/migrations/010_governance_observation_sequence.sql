ALTER TABLE proposal_state_observations ADD COLUMN IF NOT EXISTS ordinal integer;
WITH ranked AS (
  SELECT id,row_number() OVER(PARTITION BY organization_id,proposal_id ORDER BY created_at,id)::int AS ordinal
  FROM proposal_state_observations
)
UPDATE proposal_state_observations o SET ordinal=r.ordinal FROM ranked r WHERE o.id=r.id AND o.ordinal IS NULL;
ALTER TABLE proposal_state_observations ALTER COLUMN ordinal SET NOT NULL;
ALTER TABLE proposal_state_observations ADD CONSTRAINT proposal_observation_ordinal_positive CHECK(ordinal>0) NOT VALID;
ALTER TABLE proposal_state_observations VALIDATE CONSTRAINT proposal_observation_ordinal_positive;
CREATE UNIQUE INDEX IF NOT EXISTS proposal_observation_ordinal_unique ON proposal_state_observations(organization_id,proposal_id,ordinal);
