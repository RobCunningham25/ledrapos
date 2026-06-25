// submit-membership-application — public endpoint, no auth required.
// Stores a new membership application and emails the venue admin.

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
  ordinary: "Ordinary Member",
  social: "Social Member",
  intermediate: "Intermediate Member",
  junior: "Junior Member",
  crew_visitor: "Crew Visitor",
};

function formatZAR(cents: number): string {
  return `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}

function renderAdminNotificationEmail(args: {
  venueName: string;
  applicantName: string;
  category: string;
  email: string;
  mobile: string;
  totalCents: number;
  applicationUrl: string;
  addonMembers: { category: string; name: string }[];
}): string {
  const safe = (s: string) => escapeHtml(s);
  const addonRow = args.addonMembers.length > 0
    ? `<tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;">Add-ons</td>
           <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;color:#334155;">${safe(args.addonMembers.map(m => `${m.name} (${m.category === 'intermediate' ? '19–30' : '12–18'})`).join(', '))}</td></tr>`
    : '';
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B3A4B;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#1B3A4B;">New Membership Application</h1>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">
        A new application has been submitted to <strong>${safe(args.venueName)}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;width:140px;">Applicant</td>
            <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;font-weight:600;color:#1B3A4B;">${safe(args.applicantName)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;">Category</td>
            <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;color:#334155;">${safe(CATEGORY_LABELS[args.category] ?? args.category)}</td></tr>
        ${addonRow}
        <tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;">Email</td>
            <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;color:#334155;">${safe(args.email)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;">Mobile</td>
            <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:14px;color:#334155;">${safe(args.mobile)}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#64748B;">Fees due</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600;color:#1B3A4B;">${safe(formatZAR(args.totalCents))}</td></tr>
      </table>
      <a href="${safe(args.applicationUrl)}" style="display:inline-block;background:#2A9D8F;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">Review Application</a>
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
      venue_id, membership_category, calculated_fees,
      surname, first_names, id_number, date_of_birth,
      postal_address, postal_code, home_address, home_code,
      contact_mobile, contact_work, contact_home, email,
      emergency_contact_name, emergency_contact_number,
      occupation, employer, business_type, other_clubs,
      partner_name, partner_dob, children, addon_members, boating_experience, boats,
      photo_url,
    } = body;

    // Basic validation
    if (!venue_id || !membership_category || !surname || !first_names || !contact_mobile || !email) {
      return json(400, { error: "Missing required fields" });
    }

    // Resolve venue
    const { data: venue, error: venueErr } = await supabase
      .from("venues")
      .select("id, name, contact_email, broadcast_from_email")
      .eq("id", venue_id)
      .single();
    if (venueErr || !venue) return json(404, { error: "Venue not found" });

    // Insert application
    const { data: app, error: insertErr } = await supabase
      .from("membership_applications")
      .insert({
        venue_id,
        membership_category,
        calculated_fees,
        surname,
        first_names,
        id_number: id_number || null,
        date_of_birth: date_of_birth || null,
        postal_address: postal_address || null,
        postal_code: postal_code || null,
        home_address: home_address || null,
        home_code: home_code || null,
        contact_mobile,
        contact_work: contact_work || null,
        contact_home: contact_home || null,
        email,
        emergency_contact_name: emergency_contact_name || null,
        emergency_contact_number: emergency_contact_number || null,
        occupation: occupation || null,
        employer: employer || null,
        business_type: business_type || null,
        other_clubs: other_clubs || null,
        partner_name: partner_name || null,
        partner_dob: partner_dob || null,
        children: children || null,
        addon_members: addon_members || null,
        boating_experience: boating_experience || null,
        boats: boats || null,
        photo_url: photo_url || null,
      })
      .select("id")
      .single();

    if (insertErr || !app) {
      console.error("Insert error:", insertErr);
      return json(500, { error: "Failed to save application" });
    }

    // Send admin notification email
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://pos.ledra.co.za";
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = venue.broadcast_from_email ?? Deno.env.get("INVITE_FROM_EMAIL") ?? "noreply@vaalcruising.co.za";
    const adminEmail = venue.contact_email ?? "info@vaalcruising.co.za";
    const totalCents = calculated_fees?.total_cents ?? 0;

    // Derive the admin URL — slug-based for now; custom domain admins will reach it from their context
    const applicationUrl = `${siteUrl}/vca/admin/applications`;

    if (resendKey) {
      const emailHtml = renderAdminNotificationEmail({
        venueName: venue.name,
        applicantName: `${first_names} ${surname}`,
        category: membership_category,
        email,
        mobile: contact_mobile,
        totalCents,
        applicationUrl,
        addonMembers: Array.isArray(addon_members) ? addon_members : [],
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [adminEmail],
          subject: `New Membership Application — ${first_names} ${surname}`,
          html: emailHtml,
        }),
      });
    }

    return json(201, { id: app.id });
  } catch (err) {
    console.error("submit-membership-application error:", err);
    return json(500, { error: "Internal server error" });
  }
});
