-- Add addon_members column to membership_applications.
-- Stores intermediate (19-30) and junior (12-18) family members attached to an Ordinary application.

ALTER TABLE membership_applications
  ADD COLUMN IF NOT EXISTS addon_members JSONB;

-- No RLS change needed — same permissive policy as the rest of the table.
