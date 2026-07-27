-- Club Manager workspace.
-- Adds a 'manager' admin role (facilities/caravan role-holder, no bar duties),
-- an issue "remedy / action taken" field, and the staff_jobs + leave_requests
-- tables backing the manager's Jobs and Leave pages. Committee (admin/superadmin)
-- assigns jobs and approves leave; the manager receives jobs and applies for leave.

-- ===== 1. Allow the 'manager' role =====
-- The original inline CHECK (admin_users_role_check) only permitted admin/superadmin.
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('admin', 'superadmin', 'manager'));

-- ===== 2. Issue "remedy / action taken" =====
-- Distinct from admin_notes (internal committee notes). Records the action the
-- manager took to resolve a reported issue, plus who/when.
ALTER TABLE issue_reports
  ADD COLUMN IF NOT EXISTS remedy      TEXT,
  ADD COLUMN IF NOT EXISTS remedied_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remedied_at TIMESTAMPTZ;

-- ===== 3. staff_jobs =====
-- Generalizable jobs/tasks table. Used for the club manager now (assigned_to =
-- his admin_users row), but any staff role can be assigned later without a rewrite.
CREATE TABLE IF NOT EXISTS staff_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  assigned_to   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  assigned_by   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  priority      TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  manager_notes TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_staff_jobs_assignee
  ON staff_jobs (venue_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_staff_jobs_venue_status
  ON staff_jobs (venue_id, status, created_at DESC);

ALTER TABLE staff_jobs ENABLE ROW LEVEL SECURITY;

-- Permissive RLS (repo convention); cross-venue isolation enforced in code.
CREATE POLICY "staff_jobs_select" ON staff_jobs
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "staff_jobs_insert" ON staff_jobs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "staff_jobs_update" ON staff_jobs
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "staff_jobs_delete" ON staff_jobs
  FOR DELETE USING (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON staff_jobs TO authenticated;
GRANT ALL ON staff_jobs TO service_role;

-- ===== 4. leave_requests =====
CREATE TABLE IF NOT EXISTS leave_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user
  ON leave_requests (venue_id, admin_user_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_venue_status
  ON leave_requests (venue_id, status, start_date);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_requests_select" ON leave_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "leave_requests_insert" ON leave_requests
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leave_requests_update" ON leave_requests
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leave_requests_delete" ON leave_requests
  FOR DELETE USING (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON leave_requests TO authenticated;
GRANT ALL ON leave_requests TO service_role;
