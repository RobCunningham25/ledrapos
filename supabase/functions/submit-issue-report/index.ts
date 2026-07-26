// submit-issue-report — portal members report an issue or leave a suggestion.
// Stores the report (with optional photo attachments already uploaded to the
// issue-attachments bucket) and emails the venue admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

const CATEGORY_LABELS: Record<string, string> = {
  issue: "Issue / Maintenance",
  suggestion: "Suggestion",
  other: "Other",
};

function renderAdminEmail(args: {
  venueName: string;
  categoryLabel: string;
  reporterName: string;
  reporterEmail: string;
  message: string;
  photoUrls: string[];
  adminUrl: string;
}): string {
  const safe = (s: string) => escapeHtml(s);
  const messageHtml = safe(args.message).replace(/\n/g, "<br/>");
  const photosHtml = args.photoUrls.length > 0
    ? `<div style="margin:0 0 24px 0;">
         <div style="font-size:13px;color:#64748B;margin-bottom:8px;">Attached photos (${args.photoUrls.length})</div>
         <div>${args.photoUrls.map((u) => `<a href="${u}" style="display:inline-block;margin:0 8px 8px 0;"><img src="${u}" alt="attachment" style="width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #E2E8F0;"/></a>`).join("")}</div>
       </div>`
    : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B3A4B;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#1B3A4B;">New ${safe(args.categoryLabel)}</h1>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">
        A member has submitted a report through the <strong>${safe(args.venueName)}</strong> portal.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;width:120px;">From</td>
            <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;font-weight:600;color:#1B3A4B;">${safe(args.reporterName)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;">Email</td>
            <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;color:#334155;">${safe(args.reporterEmail)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;">Type</td>
            <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;color:#334155;">${safe(args.categoryLabel)}</td></tr>
      </table>
      <div style="background:#F8FAFC;border:1px solid #F1F5F9;border-radius:6px;padding:16px;margin-bottom:24px;font-size:14px;line-height:1.6;color:#334155;">
        ${messageHtml}
      </div>
      ${photosHtml}
      <a href="${safe(args.adminUrl)}" style="display:inline-block;background:#2A9D8F;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">View in Admin</a>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
      venue_id,
      member_id,
      category,
      message,
      attachment_paths,
    } = body as {
      venue_id?: string;
      member_id?: string;
      category?: string;
      message?: string;
      attachment_paths?: string[];
    };

    if (!venue_id || !message || !message.trim()) {
      return json(400, { error: "Message and venue are required." });
    }

    const safeCategory = ["issue", "suggestion", "other"].includes(category ?? "")
      ? category!
      : "issue";
    const paths = Array.isArray(attachment_paths) ? attachment_paths.filter((p) => typeof p === "string") : [];

    // Resolve venue + reporter details
    const { data: venue, error: venueErr } = await supabase
      .from("venues")
      .select("id, name, slug, contact_email, broadcast_from_email")
      .eq("id", venue_id)
      .single();
    if (venueErr || !venue) return json(404, { error: "Venue not found" });

    let reporterName = "A member";
    let reporterEmail = "";
    if (member_id) {
      const { data: member } = await supabase
        .from("members")
        .select("first_name, last_name, email, venue_id")
        .eq("id", member_id)
        .single();
      // Guard cross-venue: only attribute if the member belongs to this venue.
      if (member && member.venue_id === venue_id) {
        reporterName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "A member";
        reporterEmail = member.email ?? "";
      }
    }

    const { data: report, error: insertErr } = await supabase
      .from("issue_reports")
      .insert({
        venue_id,
        member_id: member_id ?? null,
        category: safeCategory,
        message: message.trim(),
        attachment_paths: paths,
        reporter_name: reporterName,
        reporter_email: reporterEmail || null,
      })
      .select("id")
      .single();

    if (insertErr || !report) {
      console.error("issue_reports insert error:", insertErr);
      return json(500, { error: "Failed to save report" });
    }

    // Signed URLs for the admin email (private bucket) — best effort.
    const photoUrls: string[] = [];
    for (const p of paths) {
      const { data: signed } = await supabase.storage
        .from("issue-attachments")
        .createSignedUrl(p, 60 * 60 * 24 * 7); // 7 days
      if (signed?.signedUrl) photoUrls.push(signed.signedUrl);
    }

    // Notify the venue admin (best effort — a mail failure must not fail the submit).
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = venue.broadcast_from_email ?? Deno.env.get("INVITE_FROM_EMAIL") ?? "noreply@vaalcruising.co.za";
    const adminEmail = venue.contact_email ?? "info@vaalcruising.co.za";
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://pos.ledra.co.za";
    const adminUrl = `${siteUrl}/${venue.slug ?? "vca"}/admin/issues`;
    const categoryLabel = CATEGORY_LABELS[safeCategory] ?? "Report";

    if (resendKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [adminEmail],
            reply_to: reporterEmail || undefined,
            subject: `New ${categoryLabel} — ${reporterName}`,
            html: renderAdminEmail({
              venueName: venue.name,
              categoryLabel,
              reporterName,
              reporterEmail,
              message: message.trim(),
              photoUrls,
              adminUrl,
            }),
          }),
        });
      } catch (mailErr) {
        console.error("issue notification email failed:", mailErr);
      }
    }

    return json(201, { id: report.id });
  } catch (err) {
    console.error("submit-issue-report error:", err);
    return json(500, { error: "Internal server error" });
  }
});
