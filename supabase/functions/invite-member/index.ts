import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

type MemberRow = {
  id: string
  email: string
  first_name: string | null
  auth_user_id: string | null
  venue_id: string
}

type VenueRow = {
  slug: string
  name: string
  contact_email: string | null
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInviteEmail(args: {
  actionLink: string
  venueName: string
  contactEmail: string | null
  firstName: string | null
}) {
  const safeName = args.firstName ? escapeHtml(args.firstName) : 'there'
  const safeVenue = escapeHtml(args.venueName)
  const safeLink = escapeHtml(args.actionLink)
  const contactLine = args.contactEmail
    ? `<p style="margin:0 0 4px 0;color:#5A6B7A;font-size:13px;">Questions? Reply to this email or contact <a href="mailto:${escapeHtml(args.contactEmail)}" style="color:#2A9D8F;text-decoration:none;">${escapeHtml(args.contactEmail)}</a>.</p>`
    : ''
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B3A4B;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#1B3A4B;line-height:1.3;">Welcome to the ${safeVenue} member portal</h1>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#334155;">Hi ${safeName},</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">You've been invited to join the ${safeVenue} member portal &mdash; your online home at the club. Click the button below to accept the invite and set your password.</p>
      <p style="margin:0 0 10px 0;font-size:15px;font-weight:600;color:#1B3A4B;">What you can do in the portal:</p>
      <ul style="margin:0 0 24px 20px;padding:0;font-size:14px;line-height:1.7;color:#334155;">
        <li>View your bar tab balance and past transactions</li>
        <li>Browse the club events calendar</li>
        <li>Check the local weather and water conditions</li>
        <li>Update your contact details, boats and sites</li>
        <li>Book accommodation at the club</li>
      </ul>
      <div style="text-align:center;margin:28px 0;">
        <a href="${safeLink}" style="display:inline-block;background:#2A9D8F;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:6px;">Accept invite &amp; set password</a>
      </div>
      <p style="margin:0 0 6px 0;font-size:13px;color:#5A6B7A;">If the button doesn't work, paste this link into your browser:</p>
      <p style="margin:0 0 24px 0;font-size:12px;word-break:break-all;"><a href="${safeLink}" style="color:#2A9D8F;text-decoration:none;">${safeLink}</a></p>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:20px 0;" />
      <p style="margin:0 0 4px 0;color:#5A6B7A;font-size:13px;">&mdash; ${safeVenue}</p>
      ${contactLine}
    </div>
  </div>
</body>
</html>`
}

async function generateLinkAndSend(
  supabase: SupabaseClient,
  member: MemberRow,
  venue: VenueRow,
  siteUrl: string,
  resendApiKey: string,
  fromEmail: string,
): Promise<{ user?: { id: string }; error?: string }> {
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: member.email,
    options: {
      redirectTo: `${siteUrl}/${venue.slug}/portal/accept-invite`,
      data: { member_id: member.id, venue_id: member.venue_id },
    },
  })

  if (linkError) {
    return { error: `Supabase Auth error: ${linkError.message}` }
  }

  const actionLink = linkData?.properties?.action_link
  const authUser = linkData?.user
  if (!actionLink || !authUser) {
    return { error: 'Failed to generate invite link (no action_link returned).' }
  }

  const html = renderInviteEmail({
    actionLink,
    venueName: venue.name,
    contactEmail: venue.contact_email,
    firstName: member.first_name,
  })

  const resendBody: Record<string, unknown> = {
    from: `${venue.name} <${fromEmail}>`,
    to: [member.email],
    subject: `Welcome to the ${venue.name} member portal`,
    html,
  }
  if (venue.contact_email) {
    resendBody.reply_to = venue.contact_email
  }

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
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
    return { error: `Resend error: ${detail}` }
  }

  return { user: { id: authUser.id } }
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

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

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id, venue_id')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!adminUser) {
      return json(403, { error: 'Admin access required' })
    }

    const { member_id, venue_id, resend } = await req.json()

    if (!member_id || !venue_id) {
      return json(400, { error: 'member_id and venue_id are required' })
    }

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, email, first_name, auth_user_id, venue_id')
      .eq('id', member_id)
      .eq('venue_id', venue_id)
      .single<MemberRow>()

    if (memberError || !member) {
      return json(404, { error: 'Member not found' })
    }

    if (!member.email) {
      return json(400, { error: 'Member has no email address. Add an email before inviting.' })
    }

    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('slug, name, contact_email')
      .eq('id', venue_id)
      .single<VenueRow>()

    if (venueError || !venue) {
      return json(404, { error: 'Venue not found for invite.' })
    }

    // Find any existing auth user for this email (handles both the linked case
    // and the rare case where the user was created without being linked).
    const email = member.email.toLowerCase()
    let existingAuthUser: { id: string; email?: string; email_confirmed_at?: string | null; last_sign_in_at?: string | null } | null = null

    if (member.auth_user_id) {
      const { data: byId } = await supabase.auth.admin.getUserById(member.auth_user_id)
      if (byId?.user) existingAuthUser = byId.user as typeof existingAuthUser
    }

    if (!existingAuthUser) {
      const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (usersData?.users) {
        existingAuthUser = (usersData.users.find(
          (u) => u.email?.toLowerCase() === email
        ) as typeof existingAuthUser) || null
      }
    }

    const userHasSignedIn = !!existingAuthUser?.last_sign_in_at

    // New-invite path: member has no auth_user_id and no existing auth user with this email.
    if (!resend && !existingAuthUser) {
      const result = await generateLinkAndSend(supabase, member, venue, siteUrl, resendApiKey, fromEmail)
      if (result.error || !result.user) {
        return json(500, { error: result.error ?? 'Failed to send invite.' })
      }

      const { error: updateError } = await supabase
        .from('members')
        .update({ auth_user_id: result.user.id })
        .eq('id', member_id)

      if (updateError) {
        return json(500, { error: `Invite sent but failed to link account: ${updateError.message}` })
      }

      return json(200, { success: true, auth_user_id: result.user.id, action: 'invited' })
    }

    // Link-existing path: email is already in auth.users but the member row isn't linked,
    // AND caller didn't ask for a resend. Link silently (no email sent).
    if (!resend && existingAuthUser && !member.auth_user_id) {
      const { error: updateError } = await supabase
        .from('members')
        .update({ auth_user_id: existingAuthUser.id })
        .eq('id', member_id)

      if (updateError) {
        return json(500, { error: `Failed to link member to existing account: ${updateError.message}` })
      }

      return json(200, {
        success: true,
        auth_user_id: existingAuthUser.id,
        action: 'linked',
        message: 'Member linked to existing account. They can log in with their existing password.',
      })
    }

    // Already linked, caller didn't ask for resend.
    if (!resend && existingAuthUser && member.auth_user_id) {
      return json(409, { error: 'This member has already been invited. Use Resend to send the invite email again.' })
    }

    // Resend path.
    if (resend) {
      if (!existingAuthUser) {
        // Nothing to resend to — fall through to a fresh invite.
        const result = await generateLinkAndSend(supabase, member, venue, siteUrl, resendApiKey, fromEmail)
        if (result.error || !result.user) {
          return json(500, { error: result.error ?? 'Failed to send invite.' })
        }
        await supabase
          .from('members')
          .update({ auth_user_id: result.user.id })
          .eq('id', member_id)

        return json(200, { success: true, auth_user_id: result.user.id, action: 'invited' })
      }

      if (userHasSignedIn) {
        return json(409, {
          error: 'This member has already signed in to the portal. Send them a password reset link instead.',
        })
      }

      // Delete the unconfirmed auth user and re-invite fresh. This regenerates the invite
      // token and triggers a fresh invite email.
      const { error: delError } = await supabase.auth.admin.deleteUser(existingAuthUser.id)
      if (delError) {
        return json(500, { error: `Failed to reset prior invite: ${delError.message}` })
      }

      const result = await generateLinkAndSend(supabase, member, venue, siteUrl, resendApiKey, fromEmail)
      if (result.error || !result.user) {
        // The old user was deleted; clear the stale link so Invite works again.
        await supabase.from('members').update({ auth_user_id: null }).eq('id', member_id)
        return json(500, { error: result.error ?? 'Failed to resend invite.' })
      }

      const { error: updateError } = await supabase
        .from('members')
        .update({ auth_user_id: result.user.id })
        .eq('id', member_id)

      if (updateError) {
        return json(500, { error: `Invite resent but failed to relink account: ${updateError.message}` })
      }

      return json(200, { success: true, auth_user_id: result.user.id, action: 'resent' })
    }

    // Should be unreachable.
    return json(500, { error: 'Unhandled invite state.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json(500, { error: `Invite function crashed: ${message}` })
  }
})
