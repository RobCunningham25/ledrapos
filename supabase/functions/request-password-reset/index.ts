import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

type VenueRow = {
  slug: string
  name: string
  contact_email: string | null
  portal_domain: string | null
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderResetEmail(args: {
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
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#1B3A4B;line-height:1.3;">Reset your ${safeVenue} portal password</h1>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#334155;">Hi ${safeName},</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">We received a request to reset the password for your ${safeVenue} member portal account. Click the button below to choose a new password.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${safeLink}" style="display:inline-block;background:#2A9D8F;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:6px;">Reset password</a>
      </div>
      <p style="margin:0 0 6px 0;font-size:13px;color:#5A6B7A;">If the button doesn't work, paste this link into your browser:</p>
      <p style="margin:0 0 20px 0;font-size:12px;word-break:break-all;"><a href="${safeLink}" style="color:#2A9D8F;text-decoration:none;">${safeLink}</a></p>
      <p style="margin:0 0 24px 0;font-size:13px;line-height:1.55;color:#5A6B7A;">If you didn't request this, you can safely ignore this email &mdash; your password won't change.</p>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:20px 0;" />
      <p style="margin:0 0 4px 0;color:#5A6B7A;font-size:13px;">&mdash; ${safeVenue}</p>
      ${contactLine}
    </div>
  </div>
</body>
</html>`
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
      .select('slug, name, contact_email, portal_domain')
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
      venueName: venue.name,
      contactEmail: venue.contact_email,
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
