-- KYC / KYB package submission timestamps (draft vs submitted-for-review)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS kyb_submitted_at TIMESTAMPTZ;

COMMENT ON COLUMN drivers.kyc_submitted_at IS 'When the driver last submitted a full KYC package for admin review; NULL while editing drafts.';
COMMENT ON COLUMN suppliers.kyb_submitted_at IS 'When the supplier last submitted a full KYB package for admin review; NULL while editing drafts.';

-- Legacy: drivers already in review with pending docs but no submission marker — backfill so admin queue stays consistent.
UPDATE drivers d
SET kyc_submitted_at = COALESCE(d.kyc_submitted_at, sub.first_pending)
FROM (
  SELECT owner_id::uuid AS driver_id, MIN(created_at) AS first_pending
  FROM documents
  WHERE owner_type = 'driver'
    AND verification_status IN ('pending', 'pending_review')
  GROUP BY owner_id
) sub
WHERE d.id = sub.driver_id
  AND d.kyc_submitted_at IS NULL
  AND d.compliance_status = 'pending'
  AND d.kyc_status = 'pending'
  AND d.status IN ('pending_compliance', 'rejected');

-- Legacy suppliers: same pattern (documents keyed by supplier owner user id)
UPDATE suppliers s
SET kyb_submitted_at = COALESCE(s.kyb_submitted_at, sub.first_pending)
FROM (
  SELECT owner_id::uuid AS owner_user_id, MIN(created_at) AS first_pending
  FROM documents
  WHERE owner_type = 'supplier'
    AND verification_status IN ('pending', 'pending_review')
  GROUP BY owner_id
) sub
WHERE s.owner_id = sub.owner_user_id
  AND s.kyb_submitted_at IS NULL
  AND s.compliance_status = 'pending'
  AND s.kyb_status = 'pending'
  AND s.status IN ('pending_compliance', 'rejected');
