-- Fix missing USING clause on membership_applications UPDATE policy.
-- Without USING, PostgreSQL can't locate rows to update, so approve/reject
-- silently affect 0 rows. All other tables in this project use both clauses.

DROP POLICY IF EXISTS "applications_authenticated_update" ON membership_applications;

CREATE POLICY "applications_authenticated_update" ON membership_applications
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
