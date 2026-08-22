ALTER TABLE proposal_state_observations DROP CONSTRAINT IF EXISTS proposal_state_observations_state_check;
ALTER TABLE proposal_state_observations ADD CONSTRAINT proposal_state_observations_state_check
CHECK(state IN('REVIEW','PUBLISHED','PENDING','ACTIVE','CANCELED','SUCCEEDED','DEFEATED','QUEUED','EXECUTED','EXPIRED'));
