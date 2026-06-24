-- Membership applications — digital application form for prospective VCA members.
-- Public-facing form at /:slug/apply; admin review at /:slug/admin/applications.

CREATE TABLE membership_applications (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Step 1: category + fee snapshot
  membership_category       TEXT NOT NULL
                            CHECK (membership_category IN ('ordinary','social','intermediate','junior','crew_visitor')),
  calculated_fees           JSONB,   -- { joining_fee, land_levy, pro_rata_subs, months_remaining, total }

  -- Step 2: applicant personal details
  surname                   TEXT NOT NULL,
  first_names               TEXT NOT NULL,
  id_number                 TEXT,
  date_of_birth             DATE,
  postal_address            TEXT,
  postal_code               TEXT,
  home_address              TEXT,
  home_code                 TEXT,
  contact_mobile            TEXT NOT NULL,
  contact_work              TEXT,
  contact_home              TEXT,
  email                     TEXT NOT NULL,
  emergency_contact_name    TEXT,
  emergency_contact_number  TEXT,
  occupation                TEXT,
  employer                  TEXT,
  business_type             TEXT,
  other_clubs               TEXT,

  -- Step 3: family + boats
  partner_name              TEXT,
  partner_dob               DATE,
  children                  JSONB,  -- [{name, dob}]
  boating_experience        TEXT,
  boats                     JSONB,  -- [{type, name, reg_no, ownership}]

  -- Step 4: photo
  photo_url                 TEXT,   -- path in application-photos bucket

  -- Admin workflow
  interview_conducted_at    TIMESTAMPTZ,
  members_notified_at       TIMESTAMPTZ,
  reviewer_notes            TEXT,
  reviewed_at               TIMESTAMPTZ,
  reviewed_by               UUID REFERENCES admin_users(id),
  member_id                 UUID REFERENCES members(id)  -- set after approval + member creation
);

ALTER TABLE membership_applications ENABLE ROW LEVEL SECURITY;

-- Public can insert (Edge Function uses service role; this covers direct client inserts too)
CREATE POLICY "applications_public_insert" ON membership_applications
  FOR INSERT WITH CHECK (true);

-- Only authenticated users (admins) can read or update
CREATE POLICY "applications_authenticated_select" ON membership_applications
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "applications_authenticated_update" ON membership_applications
  FOR UPDATE WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON membership_applications TO authenticated, anon;

-- ===== application-photos storage bucket =====
-- Private bucket: anon can upload (public form), authenticated can read (admin drawer).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'application-photos',
  'application-photos',
  false,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone can upload (public form submits before the Edge Function call)
CREATE POLICY "application_photos_anon_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'application-photos');

-- Only authenticated users (admins) can read
CREATE POLICY "application_photos_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'application-photos');

-- Authenticated users can delete (cleanup on rejection)
CREATE POLICY "application_photos_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'application-photos');
