import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

type MemberRow = {
  id: string
  first_name: string | null
  last_name: string | null
  venue_id: string
}

type VenueRow = EmailVenue & {
  slug: string
}

type LoginRow = {
  id: string
  member_id: string
  auth_user_id: string
  email: string
  is_active: boolean
}

function renderSecondaryInviteEmail(args: {
  actionLink: string
  venue: VenueRow
  primaryName: string
  label: string | null
}) {
  const safeVenue = escapeHtml(args.venue.name)
  const safePrimaryName = escapeHtml(args.primaryName)
  const safeLabel = args.label ? escapeHtml(args.label) : null

  const bodyHtml = [
    emailHeading(`You've been added to the ${args.venue.name} member portal`),
    emailParagraph(`Hi${safeLabel ? ` ${safeLabel}` : ''},`),
    emailParagraph(
      `You've been given your own login${safeLabel ? '' : ' by the club'} to access ${safePrimaryName}&rsquo;s membership at ${safeVenue} &mdash; your own email and password, same account. Click the button below to accept and set your password.`,
    ),
    `<p style="margin:0 0 10px;font-size:15px;font-weight:600;color:#1B3A4B;">What you can do in the portal:</p>
      <ul style="margin:0 0 24px 20px;padding:0;font-size:14px;line-height:1.7;color:#334155;">
        <li>View the bar tab balance and past transactions</li>
        <li>Browse the club events calendar and RSVP</li>
        <li>Check the local weather and water conditions</li>
        <li>Update contact details, boats and sites</li>
        <li>Book accommodation at the club</li>
      </ul>`,
    emailButton({ href: args.actionLink, label: 'Accept invite & set password' }),
    emailLinkFallback(args.actionLink),
    emailContactLine(args.venue.contact_email),
  ].join('\n      ')

  return emailShell({
    venue: args.venue,
    title: `You've been added to the ${args.venue.name} member portal`,
    preheader: `Accept your invite and set a password for the ${args.venue.name} member portal.`,
    bodyHtml,
    footerLines: venueFooterLines(args.venue),
  })
}

async function findExistingAuthUser(
  supabaseAdmin: SupabaseClient,
  email: string,
  priorAuthUserId: string | null,
): Promise<{ id: string; email?: string; last_sign_in_at?: string | null } | null> {
  if (priorAuthUserId) {
    const { data: byId } = await supabaseAdmin.auth.admin.getUserById(priorAuthUserId)
    if (byId?.user) return byId.user as typeof byId.user
  }

  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (usersData?.users) {
    const match = usersData.users.find((u) => u.email?.toLowerCase() === email)
    if (match) return match as typeof match
  }
  return null
}

async function generateLinkAndSend(
  supabaseAdmin: SupabaseClient,
  email: string,
  venue: VenueRow,
  primaryName: string,
  label: string | null,
  siteUrl: string,
  resendApiKey: string,
  fromEmail: string,
  memberId: string,
  venueId: string,
): Promise<{ user?: { id: string }; error?: string }> {
  const redirectBase = venue.portal_domain
    ? `https://${venue.portal_domain}/accept-invite`
    : `${siteUrl}/${venue.slug}/portal/accept-invite`

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: redirectBase,
      data: { member_id: memberId, venue_id: venueId, secondary: true },
    },
  })

  if (linkError) {
    console.error('[invite-secondary] generateLink error:', JSON.stringify(linkError))
    return { error: `Supabase Auth error: ${linkError.message}` }
  }

  const actionLink = linkData?.properties?.action_link
  const authUser = linkData?.user
  if (!actionLink || !authUser) {
    return { error: 'Failed to generate invite link (no action_link returned).' }
  }

  const html = renderSecondaryInviteEmail({ actionLink, venue, primaryName, label })

  const resendBody: Record<string, unknown> = {
    from: `${venue.name} <${fromEmail}>`,
    to: [email],
    subject: `You've been added to the ${venue.name} member portal`,
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const secretKey = Deno.env.get('SB_SECRET_KEY')
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const supabaseAdmin = secretKey ? createClient(supabaseUrl, secretKey) : supabase

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

    const body = await req.json()

    // ===== Revoke =====
    if (body.action === 'revoke') {
      const { login_id, venue_id } = body
      if (!login_id || !venue_id) {
        return json(400, { error: 'login_id and venue_id are required' })
      }
      const { error: revokeError } = await supabase
        .from('member_auth_logins')
        .update({ is_active: false })
        .eq('id', login_id)
        .eq('venue_id', venue_id)

      if (revokeError) {
        return json(500, { error: `Failed to revoke: ${revokeError.message}` })
      }
      return json(200, { success: true })
    }

    // ===== Invite / resend =====
    const { member_id, venue_id, email: rawEmail, label, resend } = body

    if (!member_id || !venue_id || typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
      return json(400, { error: 'member_id, venue_id and a valid email are required' })
    }
    const email = rawEmail.trim().toLowerCase()

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, venue_id')
      .eq('id', member_id)
      .eq('venue_id', venue_id)
      .single<MemberRow & { email: string | null }>()

    if (memberError || !member) {
      return json(404, { error: 'Member not found' })
    }

    if (member.email && member.email.toLowerCase() === email) {
      return json(400, { error: "That's already this member's primary login email." })
    }

    // Collision guard: this email must not already be someone's own primary
    // login for a *different* member.
    const { data: primaryClash } = await supabase
      .from('members')
      .select('id')
      .ilike('email', email)
      .neq('id', member_id)
      .maybeSingle()
    if (primaryClash) {
      return json(409, { error: 'This email is already registered as a primary member login for a different membership.' })
    }

    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select(VENUE_EMAIL_COLUMNS)
      .eq('id', venue_id)
      .single<VenueRow>()

    if (venueError || !venue) {
      return json(404, { error: 'Venue not found for invite.' })
    }

    const primaryName = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'this member'

    // Existing member_auth_logins row for this member+email (any status).
    const { data: existingLogin } = await supabase
      .from('member_auth_logins')
      .select('id, member_id, auth_user_id, email, is_active')
      .eq('member_id', member_id)
      .ilike('email', email)
      .maybeSingle<LoginRow>()

    // Collision guard: this email must not already be an *active* secondary
    // login attached to a *different* member.
    if (!existingLogin) {
      const { data: otherLogin } = await supabase
        .from('member_auth_logins')
        .select('id, member_id')
        .ilike('email', email)
        .eq('is_active', true)
        .neq('member_id', member_id)
        .maybeSingle()
      if (otherLogin) {
        return json(409, { error: 'This email is already an active secondary login for a different membership.' })
      }
    }

    const existingAuthUser = await findExistingAuthUser(
      supabaseAdmin,
      email,
      existingLogin?.auth_user_id ?? null,
    )

    // New-invite path.
    if (!resend && !existingLogin) {
      if (existingAuthUser) {
        // An auth.users account with this email exists but isn't attached
        // anywhere we recognise — refuse rather than silently repurposing a
        // stranger's account. Admin should confirm this is really intended
        // (e.g. via the primary Invite flow instead, if it's actually hers).
        return json(409, { error: 'An account with this email already exists. Ask the club owner to check before proceeding.' })
      }

      const result = await generateLinkAndSend(
        supabaseAdmin, email, venue, primaryName, label ?? null, siteUrl, resendApiKey, fromEmail, member_id, venue_id,
      )
      if (result.error || !result.user) {
        return json(500, { error: result.error ?? 'Failed to send invite.' })
      }

      const { error: insertError } = await supabase
        .from('member_auth_logins')
        .insert({ venue_id, member_id, auth_user_id: result.user.id, email, label: label ?? null })

      if (insertError) {
        return json(500, { error: `Invite sent but failed to link account: ${insertError.message}` })
      }
      return json(200, { success: true, auth_user_id: result.user.id, action: 'invited' })
    }

    if (!resend && existingLogin) {
      return json(409, { error: 'This person has already been invited. Use Resend to send the invite email again.' })
    }

    // ===== Resend =====
    if (resend) {
      if (!existingLogin) {
        return json(404, { error: 'No existing invite found for this email — send a new invite instead.' })
      }

      const userHasSignedIn = !!existingAuthUser?.last_sign_in_at
      if (userHasSignedIn) {
        return json(409, { error: 'This person has already signed in to the portal. There is no reset flow for a secondary login yet — ask them to use Forgot Password.' })
      }

      if (existingAuthUser) {
        const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id)
        if (delError) {
          return json(500, { error: `Failed to reset prior invite: ${delError.message}` })
        }
      }

      const result = await generateLinkAndSend(
        supabaseAdmin, email, venue, primaryName, label ?? null, siteUrl, resendApiKey, fromEmail, member_id, venue_id,
      )
      if (result.error || !result.user) {
        return json(500, { error: result.error ?? 'Failed to resend invite.' })
      }

      const { error: updateError } = await supabase
        .from('member_auth_logins')
        .update({ auth_user_id: result.user.id, is_active: true })
        .eq('id', existingLogin.id)

      if (updateError) {
        return json(500, { error: `Invite resent but failed to relink account: ${updateError.message}` })
      }
      return json(200, { success: true, auth_user_id: result.user.id, action: 'resent' })
    }

    return json(500, { error: 'Unhandled invite state.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[invite-secondary] crash:', message, err instanceof Error ? err.stack : '')
    return json(500, { error: `Invite function crashed: ${message}` })
  }
})
