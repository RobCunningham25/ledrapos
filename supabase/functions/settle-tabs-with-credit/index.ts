// settle-tabs-with-credit — Weekly batch job. Applies each member's available
// credit balance against their own open bar tabs, oldest tab first, closing
// tabs where credit covers the full outstanding amount and partially paying
// down the rest. Runs across all venues (no venue_id input) via pg_cron every
// Monday 06:00 SAST (migration 20260820060000).
//
// Deliberately not a POS-time auto-deplete (CLAUDE.md rule 4 still governs the
// live PaymentModal flow — bartenders always confirm credit manually there).
// This is a separate, explicitly-requested weekly reconciliation: members
// carry credit balances specifically to settle their tab, and an open tab
// with unused credit sitting behind it is a bug in the workflow, not a
// feature. All money movement still goes through process_payment, so the
// same insufficient-credit / atomicity guarantees apply per rule 6.
//
// Unauthenticated like expire-bookings: idempotent and harmless to re-invoke
// (a second run just finds no outstanding balance/credit left to apply).
//
// Response: { success, tabs_settled, tabs_partial, credit_applied_total_cents,
//             members_notified, errors: string[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  emailButton,
  emailContactLine,
  emailFromHeader,
  emailHeading,
  emailParagraph,
  emailShell,
  escapeHtml,
  sendResendEmail,
  venueFooterLines,
  VENUE_EMAIL_COLUMNS,
  type EmailVenue,
} from "../_shared/emailTemplate.ts";

const THROTTLE_MS = 120; // Resend free tier: 10 req/sec

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatRand(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OpenTab {
  id: string;
  venue_id: string;
  member_id: string;
  created_at: string | null;
  opened_at: string | null;
  outstanding: number;
}

interface MemberSettlement {
  memberId: string;
  venueId: string;
  creditAppliedCents: number;
  tabsClosed: number;
  tabsPartial: number;
  remainingOutstandingCents: number;
}

function renderSettlementEmail(args: {
  firstName: string;
  venue: EmailVenue;
  appliedRand: string;
  remainingCents: number;
  portalUrl: string;
}): string {
  const safeName = escapeHtml(args.firstName);
  const safeApplied = escapeHtml(args.appliedRand);

  const remainingParagraph = args.remainingCents > 0
    ? emailParagraph(
      `Your remaining balance is <strong>R${escapeHtml(formatRand(args.remainingCents))}</strong>.`,
    )
    : emailParagraph("Your bar tab is now fully paid off. 🎉");

  const bodyHtml = [
    emailHeading(`Credit applied to your ${args.venue.name} bar tab`),
    emailParagraph(`Hi ${safeName},`),
    emailParagraph(
      `We've applied <strong>R${safeApplied}</strong> of your account credit to your open bar tab.`,
    ),
    remainingParagraph,
    emailButton({ href: args.portalUrl, label: "View your tab in the portal" }),
    emailContactLine(args.venue.contact_email),
  ].join("\n      ");

  return emailShell({
    venue: args.venue,
    title: `Credit applied to your ${args.venue.name} bar tab`,
    preheader: `We applied R${args.appliedRand} of your credit to your bar tab.`,
    bodyHtml,
    footerLines: venueFooterLines(args.venue),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ===== Find open, non-cash tabs with a member attached =====
    const { data: openTabs, error: tabsError } = await supabase
      .from("tabs")
      .select("id, venue_id, member_id, created_at, opened_at")
      .eq("status", "OPEN")
      .eq("is_cash_customer", false)
      .not("member_id", "is", null);

    if (tabsError) {
      console.error("tabs query failed:", tabsError.message);
      return json(500, { success: false, error: "Failed to load open tabs" });
    }

    const tabRows = (openTabs as Array<{
      id: string;
      venue_id: string;
      member_id: string;
      created_at: string | null;
      opened_at: string | null;
    }>) || [];

    if (tabRows.length === 0) {
      return json(200, {
        success: true,
        tabs_settled: 0,
        tabs_partial: 0,
        credit_applied_total_cents: 0,
        members_notified: 0,
        errors: [],
      });
    }

    const tabIds = tabRows.map((t) => t.id);

    // ===== Outstanding balance per tab =====
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

    const openTabsWithBalance: OpenTab[] = tabRows
      .map((t) => ({
        id: t.id,
        venue_id: t.venue_id,
        member_id: t.member_id,
        created_at: t.created_at,
        opened_at: t.opened_at,
        outstanding: Math.max(0, (itemsByTab.get(t.id) ?? 0) - (paymentsByTab.get(t.id) ?? 0)),
      }))
      .filter((t) => t.outstanding > 0);

    if (openTabsWithBalance.length === 0) {
      return json(200, {
        success: true,
        tabs_settled: 0,
        tabs_partial: 0,
        credit_applied_total_cents: 0,
        members_notified: 0,
        errors: [],
      });
    }

    // ===== Group by member, oldest tab first =====
    const tabsByMember = new Map<string, OpenTab[]>();
    for (const t of openTabsWithBalance) {
      const arr = tabsByMember.get(t.member_id) ?? [];
      arr.push(t);
      tabsByMember.set(t.member_id, arr);
    }
    for (const arr of tabsByMember.values()) {
      arr.sort((a, b) => {
        const aTime = new Date(a.created_at ?? a.opened_at ?? 0).getTime();
        const bTime = new Date(b.created_at ?? b.opened_at ?? 0).getTime();
        return aTime - bTime;
      });
    }

    // ===== Credit balances for those members =====
    const memberIds = [...tabsByMember.keys()];
    const { data: credits, error: creditsError } = await supabase
      .from("member_credits")
      .select("member_id, amount_cents, type")
      .in("member_id", memberIds);

    if (creditsError) {
      console.error("member_credits query failed:", creditsError.message);
      return json(500, { success: false, error: "Failed to load member credit balances" });
    }

    const creditBalanceByMember = new Map<string, number>();
    for (const r of (credits || []) as Array<{ member_id: string; amount_cents: number; type: string }>) {
      const delta = r.type === "CREDIT" ? r.amount_cents : -r.amount_cents;
      creditBalanceByMember.set(r.member_id, (creditBalanceByMember.get(r.member_id) ?? 0) + delta);
    }

    // ===== Apply credit per member, tab by tab =====
    let tabsSettled = 0;
    let tabsPartial = 0;
    let creditAppliedTotalCents = 0;
    const errors: string[] = [];
    const settlements: MemberSettlement[] = [];

    for (const [memberId, tabs] of tabsByMember.entries()) {
      let remaining = Math.max(0, creditBalanceByMember.get(memberId) ?? 0);
      if (remaining <= 0) continue;

      let memberApplied = 0;
      let memberClosed = 0;
      let memberPartial = 0;
      let memberOutstandingLeft = 0;

      for (const tab of tabs) {
        if (remaining <= 0) {
          memberOutstandingLeft += tab.outstanding;
          continue;
        }

        const apply = Math.min(remaining, tab.outstanding);
        if (apply <= 0) {
          memberOutstandingLeft += tab.outstanding;
          continue;
        }

        const { data, error: rpcError } = await supabase.rpc("process_payment", {
          p_venue_id: tab.venue_id,
          p_tab_id: tab.id,
          p_member_id: memberId,
          p_credit_amount: apply,
          p_cash_amount: 0,
          p_card_amount: 0,
          p_card_reference: null,
        });

        if (rpcError) {
          console.error(`process_payment failed for tab ${tab.id}:`, rpcError.message);
          errors.push(`tab ${tab.id}: ${rpcError.message}`);
          memberOutstandingLeft += tab.outstanding;
          continue;
        }

        remaining -= apply;
        memberApplied += apply;
        creditAppliedTotalCents += apply;

        const closed = Boolean((data as { tab_closed?: boolean } | null)?.tab_closed);
        if (closed) {
          memberClosed++;
          tabsSettled++;
        } else {
          memberPartial++;
          tabsPartial++;
          memberOutstandingLeft += Math.max(0, tab.outstanding - apply);
        }
      }

      if (memberApplied > 0) {
        settlements.push({
          memberId,
          venueId: tabs[0].venue_id,
          creditAppliedCents: memberApplied,
          tabsClosed: memberClosed,
          tabsPartial: memberPartial,
          remainingOutstandingCents: memberOutstandingLeft,
        });
      }
    }

    // ===== Notify settled members by email =====
    let membersNotified = 0;
    if (settlements.length > 0) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const siteUrl = (Deno.env.get("SITE_URL") || "https://pos.ledra.co.za").replace(/\/+$/, "");

      if (!resendApiKey) {
        errors.push("RESEND_API_KEY not configured — settlements applied but no notifications sent");
      } else {
        const venueIds = [...new Set(settlements.map((s) => s.venueId))];
        const settledMemberIds = settlements.map((s) => s.memberId);

        const [{ data: venues }, { data: members }] = await Promise.all([
          supabase.from("venues").select(VENUE_EMAIL_COLUMNS).in("id", venueIds),
          supabase.from("members").select("id, first_name, email, email_opt_out").in("id", settledMemberIds),
        ]);

        const venueById = new Map(
          ((venues as Array<EmailVenue & { id: string; slug: string }>) || []).map((v) => [v.id, v]),
        );
        const memberById = new Map(
          (
            (members as Array<{
              id: string;
              first_name: string | null;
              email: string | null;
              email_opt_out: boolean | null;
            }>) || []
          ).map((m) => [m.id, m]),
        );

        let lastCallAt = 0;
        for (const s of settlements) {
          const venue = venueById.get(s.venueId);
          const member = memberById.get(s.memberId);
          if (!venue || !member || !member.email || member.email_opt_out) continue;

          const portalUrl = venue.portal_domain
            ? `https://${venue.portal_domain}`
            : `${siteUrl}/${venue.slug}/portal`;

          const now = Date.now();
          const since = now - lastCallAt;
          if (lastCallAt > 0 && since < THROTTLE_MS) {
            await sleep(THROTTLE_MS - since);
          }

          const html = renderSettlementEmail({
            firstName: member.first_name || "there",
            venue,
            appliedRand: formatRand(s.creditAppliedCents),
            remainingCents: s.remainingOutstandingCents,
            portalUrl,
          });

          const result = await sendResendEmail({
            apiKey: resendApiKey,
            from: emailFromHeader(venue),
            to: [member.email],
            replyTo: venue.contact_email,
            subject: `Credit applied to your ${venue.name} bar tab — R${formatRand(s.creditAppliedCents)}`,
            html,
          });
          lastCallAt = Date.now();

          if (result.ok) {
            membersNotified++;
          } else {
            errors.push(`notify ${member.email}: ${result.error}`);
          }
        }
      }
    }

    return json(200, {
      success: true,
      tabs_settled: tabsSettled,
      tabs_partial: tabsPartial,
      credit_applied_total_cents: creditAppliedTotalCents,
      members_notified: membersNotified,
      errors,
    });
  } catch (err) {
    console.error("settle-tabs-with-credit crashed:", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
