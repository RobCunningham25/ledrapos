// send-tab-reminders — Email tab reminders to every member with an open balance.
//
// Restored as part of the WhatsApp foundation work: the BarTabRemindersCard +
// useSendTabReminders hook were already invoking this function but it had drifted
// out of the repo. Re-created here with the same response contract so the existing
// dashboard button works again.
//
// Response shape (consumed by useSendTabReminders.ts):
//   { success: true, sent: number, skipped: number, errors: string[] }
//
// Throttles to Resend free tier (~8/sec). Per-venue scoped. Skips members with no
// email or email_opt_out = true. Open tab balance:
//   SUM(tab_items.line_total_cents) - SUM(payments.amount_cents)  (across that
//   member's open, non-cash tabs).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const THROTTLE_MS = 120;
const RESEND_API_URL = "https://api.resend.com/emails";

interface ReminderRequest {
  venue_id: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRand(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderReminderEmail(args: {
  firstName: string;
  venueName: string;
  contactEmail: string | null;
  amountRand: string;
  portalUrl: string;
}): string {
  const safeName = escapeHtml(args.firstName);
  const safeVenue = escapeHtml(args.venueName);
  const safeAmount = escapeHtml(args.amountRand);
  const safeUrl = escapeHtml(args.portalUrl);
  const contactLine = args.contactEmail
    ? `<p style="margin:0 0 4px 0;color:#5A6B7A;font-size:13px;">Questions? Reply to this email or contact <a href="mailto:${escapeHtml(args.contactEmail)}" style="color:#2A9D8F;text-decoration:none;">${escapeHtml(args.contactEmail)}</a>.</p>`
    : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B3A4B;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#1B3A4B;line-height:1.3;">Your ${safeVenue} bar tab</h1>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#334155;">Hi ${safeName},</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">A friendly reminder that your bar tab currently stands at <strong>R${safeAmount}</strong>.</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">You can settle it from the member portal, or pop in next time you're at the club.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${safeUrl}" style="display:inline-block;background:#2A9D8F;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:6px;">View &amp; pay in the portal</a>
      </div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:20px 0;" />
      <p style="margin:0 0 4px 0;color:#5A6B7A;font-size:13px;">&mdash; ${safeVenue}</p>
      ${contactLine}
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ===== Auth (admin only) =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { success: false, error: "Unauthorized" });

    const { data: userData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !userData?.user) {
      return json(401, { success: false, error: "Unauthorized" });
    }

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id, venue_id")
      .eq("auth_user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!adminUser) return json(403, { success: false, error: "Admin access required" });

    // ===== Input =====
    let body: ReminderRequest;
    try {
      body = await req.json();
    } catch {
      return json(400, { success: false, error: "Invalid JSON body" });
    }
    if (!body.venue_id) return json(400, { success: false, error: "venue_id required" });
    if (adminUser.venue_id !== body.venue_id) {
      return json(403, { success: false, error: "Cross-venue action not allowed" });
    }

    // ===== Resend / venue config =====
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return json(500, { success: false, error: "RESEND_API_KEY not configured" });

    const siteUrl = (Deno.env.get("SITE_URL") || "https://booking.vaalcruising.co.za").replace(/\/+$/, "");

    const { data: venue } = await supabase
      .from("venues")
      .select("id, name, slug, contact_email, broadcast_from_email, portal_domain")
      .eq("id", body.venue_id)
      .maybeSingle();
    if (!venue) return json(404, { success: false, error: "Venue not found" });

    const fromEmail = venue.broadcast_from_email
      || Deno.env.get("INVITE_FROM_EMAIL")
      || "info@vaalcruising.co.za";
    const fromHeader = `${venue.name} <${fromEmail}>`;
    const portalUrl = venue.portal_domain
      ? `https://${venue.portal_domain}`
      : `${siteUrl}/${venue.slug}/portal`;

    // ===== Find open tabs for non-cash customers =====
    const { data: openTabs, error: tabsError } = await supabase
      .from("tabs")
      .select("id, member_id")
      .eq("venue_id", body.venue_id)
      .eq("status", "OPEN")
      .eq("is_cash_customer", false)
      .not("member_id", "is", null);

    if (tabsError) {
      console.error("tabs query failed:", tabsError.message);
      return json(500, { success: false, error: "Failed to load open tabs" });
    }

    const tabRows = (openTabs as Array<{ id: string; member_id: string }>) || [];
    if (tabRows.length === 0) {
      return json(200, { success: true, sent: 0, skipped: 0, errors: [] });
    }

    const tabIds = tabRows.map((t) => t.id);

    // ===== Aggregate items + payments per tab, then sum per member =====
    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from("tab_items").select("tab_id, line_total_cents").in("tab_id", tabIds),
      supabase.from("payments").select("tab_id, amount_cents").in("tab_id", tabIds),
    ]);

    const itemsByTab = new Map<string, number>();
    for (const r of (items || []) as Array<{ tab_id: string; line_total_cents: number }>) {
      itemsByTab.set(r.tab_id, (itemsByTab.get(r.tab_id) ?? 0) + (r.line_total_cents ?? 0));
    }
    const paymentsByTab = new Map<string, number>();
    for (const r of (payments || []) as Array<{ tab_id: string; amount_cents: number }>) {
      paymentsByTab.set(r.tab_id, (paymentsByTab.get(r.tab_id) ?? 0) + (r.amount_cents ?? 0));
    }

    const balanceByMember = new Map<string, number>();
    for (const t of tabRows) {
      const itm = itemsByTab.get(t.id) ?? 0;
      const pmt = paymentsByTab.get(t.id) ?? 0;
      const outstanding = Math.max(0, itm - pmt);
      if (outstanding > 0) {
        balanceByMember.set(t.member_id, (balanceByMember.get(t.member_id) ?? 0) + outstanding);
      }
    }

    if (balanceByMember.size === 0) {
      return json(200, { success: true, sent: 0, skipped: 0, errors: [] });
    }

    // ===== Load member contact info =====
    const memberIds = [...balanceByMember.keys()];
    const { data: members } = await supabase
      .from("members")
      .select("id, first_name, email, email_opt_out")
      .in("id", memberIds);

    const memberRows = (members as Array<{
      id: string;
      first_name: string | null;
      email: string | null;
      email_opt_out: boolean | null;
    }>) || [];

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    let lastCallAt = 0;

    for (const m of memberRows) {
      const balance = balanceByMember.get(m.id) ?? 0;
      if (balance <= 0) {
        skipped++;
        continue;
      }
      if (!m.email || m.email_opt_out) {
        skipped++;
        continue;
      }

      // Throttle.
      const now = Date.now();
      const since = now - lastCallAt;
      if (lastCallAt > 0 && since < THROTTLE_MS) {
        await sleep(THROTTLE_MS - since);
      }

      const html = renderReminderEmail({
        firstName: m.first_name || "there",
        venueName: venue.name,
        contactEmail: venue.contact_email,
        amountRand: formatRand(balance),
        portalUrl,
      });

      const payload: Record<string, unknown> = {
        from: fromHeader,
        to: [m.email],
        subject: `Your ${venue.name} bar tab — R${formatRand(balance)}`,
        html,
      };
      if (venue.contact_email) payload.reply_to = venue.contact_email;

      try {
        const resp = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        lastCallAt = Date.now();
        if (resp.ok) {
          sent++;
        } else {
          const detail = await resp.json().catch(() => ({}));
          errors.push(`${m.email}: Resend ${resp.status} ${detail?.message || ""}`.trim());
        }
      } catch (err) {
        lastCallAt = Date.now();
        errors.push(`${m.email}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return json(200, { success: true, sent, skipped, errors });
  } catch (err) {
    console.error("send-tab-reminders crashed:", err);
    return json(500, { success: false, error: err instanceof Error ? err.message : String(err) });
  }
});
