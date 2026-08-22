ALTER TABLE proposal_state_observations
  ADD COLUMN voting_metadata jsonb NOT NULL DEFAULT '{"schemaVersion":"governance.voting-metadata.v1","availability":"LEGACY_NOT_RECORDED","source":"LEGACY","quorumReached":null}'::jsonb;

ALTER TABLE proposal_state_observations
  ADD CONSTRAINT proposal_observation_voting_metadata_object
  CHECK(jsonb_typeof(voting_metadata)='object');
