// Builds the redacted HTML email sent to all members after an applicant's introductory interview.
// Only includes: names, photo (via signed URL), and vessel details. No PII.

import { CATEGORY_FEES, type MembershipCategory } from './membershipFees';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Boat {
  type?: string;
  name?: string;
  reg_no?: string;
  ownership?: string;
}

interface NotificationInput {
  venueName: string;
  applicantFirstNames: string;
  applicantSurname: string;
  partnerName?: string | null;
  membershipCategory: MembershipCategory;
  boats?: Boat[] | null;
  photoSignedUrl?: string | null;
}

export function buildMemberNotificationEmail(input: NotificationInput): { subject: string; body_html: string } {
  const {
    venueName, applicantFirstNames, applicantSurname,
    partnerName, membershipCategory, boats, photoSignedUrl,
  } = input;

  const safe = (s: string) => escapeHtml(s);
  const fullName = `${applicantFirstNames} ${applicantSurname}`;
  const categoryLabel = CATEGORY_FEES[membershipCategory]?.label ?? membershipCategory;

  const partnerLine = partnerName
    ? `<p style="margin:0 0 12px 0;font-size:15px;color:#334155;">Partner: <strong>${safe(partnerName)}</strong></p>`
    : '';

  const categoryLine = `<p style="margin:0 0 16px 0;font-size:14px;color:#64748B;">Applying as: ${safe(categoryLabel)}</p>`;

  const photoSection = photoSignedUrl
    ? `<div style="margin:20px 0;text-align:center;">
        <img src="${safe(photoSignedUrl)}" alt="${safe(fullName)}" style="max-width:200px;max-height:200px;border-radius:8px;border:1px solid #E2E8F0;object-fit:cover;" />
       </div>`
    : '';

  const validBoats = (boats ?? []).filter((b) => b.name?.trim());
  const boatsSection = validBoats.length > 0
    ? `<div style="margin:16px 0;">
        <p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#1B3A4B;">Vessels:</p>
        <ul style="margin:0;padding-left:20px;font-size:14px;color:#334155;line-height:1.8;">
          ${validBoats.map((b) => `<li><strong>${safe(b.name ?? '')}</strong>${b.type ? ` (${safe(b.type)})` : ''}${b.reg_no ? ` · Reg: ${safe(b.reg_no)}` : ''}${b.ownership ? ` · ${safe(b.ownership)}` : ''}</li>`).join('')}
        </ul>
       </div>`
    : '';

  const body_html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B3A4B;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#1B3A4B;">New Member Introduction</h1>
      <div style="height:3px;width:48px;background:#2A9D8F;border-radius:2px;margin-bottom:20px;"></div>

      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
        Dear VCA Members,
      </p>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
        We are pleased to introduce <strong>${safe(fullName)}</strong>, who has recently attended their introductory meeting with the Vaal Cruising Association and is now in their 8-week probationary period.
      </p>

      ${photoSection}
      ${partnerLine}
      ${categoryLine}
      ${boatsSection}

      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:16px;margin:20px 0;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#166534;">
          We encourage you to introduce yourselves to ${safe(applicantFirstNames)} when you see them at the club and make them feel welcome!
        </p>
      </div>

      <p style="margin:0;font-size:14px;color:#64748B;line-height:1.6;">
        Warm regards,<br />
        <strong>The ${safe(venueName)} Committee</strong>
      </p>
    </div>
  </div>
</body>
</html>`;

  return {
    subject: `New Member Introduction — ${fullName}`,
    body_html,
  };
}
