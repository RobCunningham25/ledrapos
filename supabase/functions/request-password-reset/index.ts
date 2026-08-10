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

type VenueRow = EmailVenue & {
  slug: string
}

function renderResetEmail(args: {
  actionLink: string
  venue: VenueRow
  firstName: string | null
}) {
  const safeName = args.firstName ? escapeHtml(args.firstName) : 'there'
  const safeVenue = escapeHtml(args.venue.name)

  const bodyHtml = [
    emailHeading(`Reset your ${args.venue.name} portal password`),
    emailParagraph(`Hi ${safeName},`),
    emailParagraph(
      `We received a request to reset the password for your ${safeVenue} member portal account. Click the button below to choose a new password.`,
    ),
    emailButton({ href: args.actionLink, label: 'Reset password' }),
    emailLinkFallback(args.actionLink),
    emailParagraph(
      "If you didn't request this, you can safely ignore this email &mdash; your password won't change.",
      { muted: true, small: true },
    ),
    emailContactLine(args.venue.contact_email),
  ].join('\n      ')

  return emailShell({
    venue: args.venue,
    title: `Reset your ${args.venue.name} portal password`,
    preheader: 'Choose a new password for your member portal account.',
    bodyHtml,
    footerLines: venueFooterLines(args.venue),
  })
}

// Escape LIKE wildcards so the ilike match is a case-insensitive equality check.
function escapeLike(s: string) {
  return s.replace(/([%_\\])/g, '\\$1')
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
      // Prefer the new asymmetric secret API key; the legacy HS256 service_role
      // key is being rejected by GoTrue admin endpoints since the ES256 signing-key
      // migration. Fall back to the legacy key if SB_SECRET_KEY isn't set yet.
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    )

    const { email, venue_id } = await req.json()

    if (typeof email !== 'string' || !email.includes('@') || !venue_id) {
      return json(400, { error: 'email and venue_id are required' })
    }

    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select(VENUE_EMAIL_COLUMNS)
      .eq('id', venue_id)
      .single<VenueRow>()

    if (venueError || !venue) {
      return json(404, { error: 'Venue not found.' })
    }

    const { data: member } = await supabase
      .from('members')
      .select('id, email, first_name, auth_user_id')
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .ilike('email', escapeLike(email.trim()))
      .maybeSingle()

    if (!member) {
      return json(404, {
        error: 'No membership found with this email address. Contact the club if you think this is a mistake.',
      })
    }

    if (!member.auth_user_id) {
      return json(404, {
        error: "This membership doesn't have a portal account yet. Ask the club to send you an invite.",
      })
    }

    const redirectTo = venue.portal_domain
      ? `https://${venue.portal_domain}/reset-password`
      : `${siteUrl}/${venue.slug}/portal/reset-password`

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: member.email,
      options: { redirectTo },
    })

    if (linkError) {
      return json(500, { error: `Supabase Auth error: ${linkError.message}` })
    }

    const actionLink = linkData?.properties?.action_link
    if (!actionLink) {
      return json(500, { error: 'Failed to generate reset link (no action_link returned).' })
    }

    const html = renderResetEmail({
      actionLink,
      venue,
      firstName: member.first_name,
    })

    const resendBody: Record<string, unknown> = {
      from: `${venue.name} <${fromEmail}>`,
      to: [member.email],
      subject: `Reset your ${venue.name} portal password`,
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
      return json(500, { error: `Resend error: ${detail}` })
    }

    return json(200, { success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json(500, { error: `Password reset function crashed: ${message}` })
  }
})
