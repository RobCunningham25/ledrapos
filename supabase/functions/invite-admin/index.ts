import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  emailButton,
  emailContactLine,
  emailHeading,
  emailLinkFallback,
  emailParagraph,
  emailShell,
  escapeHtml,
  venueFooterLines,
  VENUE_EMAIL_COLUMNS,
  type EmailVenue,
} from '../_shared/emailTemplate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function renderAdminInviteEmail(args: {
  actionLink: string
  venue: EmailVenue
  name: string
  role: string
}) {
  const safeName = escapeHtml(args.name.split(' ')[0] || 'there')
  const safeVenue = escapeHtml(args.venue.name)
  const roleLabel = args.role === 'manager' ? 'Club Manager' : 'Admin'
  const roleBlurb = args.role === 'manager'
    ? `You'll have access to the club calendar, reported issues, your assigned jobs and leave requests.`
    : `You'll have full access to the ${safeVenue} admin panel.`

  const bodyHtml = [
    emailHeading(`You've been added to ${args.venue.name}`),
    emailParagraph(`Hi ${safeName},`),
    emailParagraph(
      `You've been set up as <strong>${roleLabel}</strong> for ${safeVenue}. ${roleBlurb} Click below to set your password and get started.`,
    ),
    emailButton({ href: args.actionLink, label: 'Set your password' }),
    emailLinkFallback(args.actionLink),
    emailContactLine(args.venue.contact_email),
  ].join('\n      ')

  return emailShell({
    venue: args.venue,
    title: `You've been added to ${args.venue.name}`,
    preheader: `Set your password to access the ${args.venue.name} ${roleLabel.toLowerCase()} workspace.`,
    bodyHtml,
    footerLines: venueFooterLines(args.venue),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return json(500, { error: 'RESEND_API_KEY is not configured.' })
    }
    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://pos.ledra.co.za').replace(/\/$/, '')
    const fromEmail = Deno.env.get('INVITE_FROM_EMAIL') ?? 'info@vaalcruising.co.za'

    // getUser (caller auth) + DB access stay on the legacy service_role key, which
    // GoTrue accepts as an apikey. Only the Auth *admin* call (generateLink) uses
    // the new asymmetric secret key, since the legacy key is intermittently
    // rejected on GoTrue admin endpoints since the ES256 signing-key migration.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const secretKey = Deno.env.get('SB_SECRET_KEY')
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const supabaseAdmin = secretKey ? createClient(supabaseUrl, secretKey) : supabase

    // Verify the caller is a superadmin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json(401, { error: 'Unauthorized' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return json(401, { error: 'Unauthorized' })
    }

    const { data: callerAdmin } = await supabase
      .from('admin_users')
      .select('id, venue_id, role')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!callerAdmin || callerAdmin.role !== 'superadmin') {
      return json(403, { error: 'Superadmin access required' })
    }

    const { email, name, role, venue_id } = await req.json()

    if (!email || !name || !venue_id) {
      return json(400, { error: 'email, name, and venue_id are required' })
    }

    // Allow creating 'admin' or 'manager' via the UI (never 'superadmin').
    const inviteRole = role ?? 'admin'
    if (inviteRole !== 'admin' && inviteRole !== 'manager') {
      return json(400, { error: 'Only admin or manager roles can be created through the UI' })
    }

    // Venue for branding + redirect slug.
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select(VENUE_EMAIL_COLUMNS)
      .eq('id', venue_id)
      .single<EmailVenue & { slug: string }>()

    if (venueError || !venue) {
      return json(404, { error: 'Venue not found for invite.' })
    }

    // Check if email already exists in admin_users for this venue
    const { data: existingAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .eq('venue_id', venue_id)
      .maybeSingle()

    if (existingAdmin) {
      return json(409, { error: 'An admin with this email already exists for this venue' })
    }

    // Insert admin_users row first
    const { data: newAdmin, error: insertError } = await supabase
      .from('admin_users')
      .insert({ venue_id, email, name, role: inviteRole, is_active: true })
      .select('id')
      .single()

    if (insertError) {
      return json(500, { error: 'Failed to create admin record: ' + insertError.message })
    }

    // Generate a branded invite link that lands on the admin set-password page.
    // A bare inviteUserByEmail() has no redirectTo, so it falls back to the Site
    // URL root and the invite token is lost — hence generateLink + explicit
    // redirectTo. The slug route on SITE_URL (pos.ledra.co.za) is allowlisted.
    const redirectTo = `${siteUrl}/${venue.slug}/admin/set-password`

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo, data: { role: inviteRole, venue_id } },
    })

    const actionLink = linkData?.properties?.action_link
    const authUser = linkData?.user

    if (linkError || !actionLink || !authUser) {
      // Roll back the admin_users row so the invite can be retried cleanly.
      await supabase.from('admin_users').delete().eq('id', newAdmin.id)
      const msg = linkError?.message ?? 'Failed to generate invite link.'
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        return json(409, { error: 'This email is already registered. Ask them to log in, or use “Forgot password” on the login page.' })
      }
      return json(500, { error: `Supabase Auth error: ${msg}` })
    }

    // Send the branded email via Resend (never Supabase's rate-limited SMTP).
    const resendBody: Record<string, unknown> = {
      from: `${venue.name} <${fromEmail}>`,
      to: [email],
      subject: `You've been added to ${venue.name}`,
      html: renderAdminInviteEmail({
        actionLink,
        venue,
        name,
        role: inviteRole,
      }),
    }
    if (venue.contact_email) resendBody.reply_to = venue.contact_email

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(resendBody),
    })

    if (!resendResp.ok) {
      let detail: string
      try {
        const body = await resendResp.json()
        detail = body?.message || body?.name || JSON.stringify(body)
      } catch {
        detail = `HTTP ${resendResp.status}`
      }
      // Keep the admin_users row + auth user; the superadmin can Resend later.
      await supabase.from('admin_users').update({ auth_user_id: authUser.id }).eq('id', newAdmin.id)
      return json(500, { error: `Invite created but email failed to send: ${detail}` })
    }

    // Link the auth user to the admin_users row.
    await supabase.from('admin_users').update({ auth_user_id: authUser.id }).eq('id', newAdmin.id)

    return json(200, { success: true, admin_id: newAdmin.id, auth_user_id: authUser.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[invite-admin] crash:', message)
    return json(500, { error: 'Internal server error' })
  }
})
