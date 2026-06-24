// Printable notice board version of a membership application.
// Only shows: names, photo, vessels. No PII. Designed to be printed to A4 and posted.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CATEGORY_FEES, type MembershipCategory } from '@/utils/membershipFees';

interface Application {
  id: string;
  created_at: string;
  first_names: string;
  surname: string;
  partner_name: string | null;
  membership_category: string;
  boats: { type?: string; name?: string; reg_no?: string; ownership?: string }[] | null;
  photo_url: string | null;
  members_notified_at: string | null;
}

export default function ApplicationNoticePage() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<Application | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error: fetchErr } = await supabase
        .from('membership_applications')
        .select('id, created_at, first_names, surname, partner_name, membership_category, boats, photo_url, members_notified_at')
        .eq('id', id)
        .single();

      if (fetchErr || !data) {
        setError('Application not found.');
        return;
      }
      setApp(data as Application);

      if (data.photo_url) {
        const { data: signed } = await supabase.storage
          .from('application-photos')
          .createSignedUrl(data.photo_url, 60 * 60 * 24 * 30);
        if (signed?.signedUrl) setPhotoUrl(signed.signedUrl);
      }
    })();
  }, [id]);

  // Auto-print once photo is resolved (or immediately if no photo)
  useEffect(() => {
    if (!app) return;
    if (app.photo_url && !photoUrl) return; // wait for signed URL
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [app, photoUrl]);

  if (error) {
    return <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#DC2626' }}>{error}</div>;
  }
  if (!app) {
    return <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#94A3B8' }}>Loading…</div>;
  }

  const categoryLabel = CATEGORY_FEES[app.membership_category as MembershipCategory]?.label ?? app.membership_category;
  const validBoats = (app.boats ?? []).filter((b) => b.name?.trim());
  const postedDate = app.members_notified_at
    ? format(new Date(app.members_notified_at), 'd MMMM yyyy')
    : format(new Date(), 'd MMMM yyyy');

  return (
    <>
      <style>{`
        @page { size: A4; margin: 20mm; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1B3A4B; background: #fff; }
      `}</style>

      {/* Print button (hidden on print) */}
      <div className="no-print" style={{ padding: '12px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 10 }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 18px', background: '#1B3A4B', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Print
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: '8px 18px', background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
        >
          Close
        </button>
      </div>

      {/* Notice */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '3px solid #1B3A4B', paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: '#2A9D8F', marginBottom: 4, textTransform: 'uppercase' }}>
            Vaal Cruising Association
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1B3A4B', marginBottom: 4 }}>
            Notice of New Membership Application
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Posted: {postedDate}</div>
        </div>

        {/* Photo + names side by side */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', marginBottom: 28 }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`${app.first_names} ${app.surname}`}
              style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2E8F0', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 140, height: 140, background: '#F1F5F9', borderRadius: 8, border: '1px dashed #CBD5E1', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 12 }}>
              No photo
            </div>
          )}

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1B3A4B', marginBottom: 4 }}>
              {app.first_names} {app.surname}
            </div>
            {app.partner_name && (
              <div style={{ fontSize: 15, color: '#475569', marginBottom: 6 }}>
                Partner: <strong>{app.partner_name}</strong>
              </div>
            )}
            <div style={{ display: 'inline-block', background: 'rgba(42,157,143,0.1)', color: '#2A9D8F', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 4, marginTop: 4 }}>
              {categoryLabel}
            </div>
          </div>
        </div>

        {/* Vessels */}
        {validBoats.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#64748B', marginBottom: 10 }}>
              Vessels
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #1B3A4B' }}>
                  {['Name', 'Type', 'Registration', 'Ownership'].map((h) => (
                    <th key={h} style={{ fontSize: 11, fontWeight: 700, color: '#1B3A4B', textAlign: 'left', padding: '6px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validBoats.map((b, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ fontSize: 13, fontWeight: 600, color: '#1A202C', padding: '8px 8px' }}>{b.name ?? '—'}</td>
                    <td style={{ fontSize: 13, color: '#475569', padding: '8px 8px' }}>{b.type ?? '—'}</td>
                    <td style={{ fontSize: 13, color: '#475569', padding: '8px 8px' }}>{b.reg_no ?? '—'}</td>
                    <td style={{ fontSize: 13, color: '#475569', padding: '8px 8px' }}>{b.ownership ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Notice text */}
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '16px 20px', marginBottom: 28 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#166534' }}>
            {app.first_names} is currently in their <strong>8-week probationary period</strong>. As per the VCA constitution,
            this notice is posted so that members may raise any concerns with the committee. We also encourage
            you to <strong>introduce yourselves</strong> when you see them at the club and make them feel welcome!
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>
            Vaal Cruising Association · Aloe Fjord, Vaal Dam · info@vaalcruising.co.za
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'right' }}>
            Application ref: {app.id.slice(0, 8).toUpperCase()}
          </div>
        </div>
      </div>
    </>
  );
}
