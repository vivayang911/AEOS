ALTER TABLE decision_retrieval_manifests
  ADD COLUMN requester_role text NOT NULL DEFAULT 'TREASURY_COMMITTEE'
  CHECK(requester_role IN('ADMIN','TREASURY_COMMITTEE','REVIEWER','OPERATOR','AUDITOR','GUARDIAN'));

ALTER TABLE decision_retrieval_manifests ALTER COLUMN requester_role DROP DEFAULT;

DROP POLICY tenant_organization_isolation ON decision_retrieval_manifests;
CREATE POLICY tenant_organization_and_role_isolation ON decision_retrieval_manifests
USING (
  aeos_is_system_worker()
  OR (
    organization_id=aeos_current_organization_id()
    AND requester_role=aeos_current_membership_role()
  )
)
WITH CHECK (
  aeos_is_system_worker()
  OR (
    organization_id=aeos_current_organization_id()
    AND requester_role=aeos_current_membership_role()
  )
);
