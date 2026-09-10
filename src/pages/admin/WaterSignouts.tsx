import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Anchor, Users, Clock, AlertTriangle } from 'lucide-react';

interface Signout {
  id: string;
  boat_name: string;
  passenger_count: number;
  passenger_note: string | null;
  contact_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  departure_at: string;
  expected_return_at: string;
  actual_return_at: string | null;
  status: 'out' | 'in';
  overdue_alert_sent_at: string | null;
  source: 'portal' | 'whatsapp';
  members: { first_name: string; last_name: string; membership_number: string } | null;
}

export default function WaterSignouts() {
  const { venueId } = useVenue();
  const [rows, setRows] = useState<Signout[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!venueId) return;
    const { data, error } = await supabase
      .from('water_signouts')
      .select('id, boat_name, passenger_count, passenger_note, contact_phone, emergency_contact_name, emergency_contact_phone, departure_at, expected_return_at, actual_return_at, status, overdue_alert_sent_at, source, members(first_name, last_name, membership_number)')
      .eq('venue_id', venueId)
      .order('departure_at', { ascending: false })
      .limit(50);
    if (!error) setRows((data as unknown as Signout[]) ?? []);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => {
    const id = setInterval(fetchRows, 30000);
    return () => clearInterval(id);
  }, [fetchRows]);

  const out = rows.filter(r => r.status === 'out');
  const recent = rows.filter(r => r.status === 'in');
  const isOverdue = (r: Signout) => r.status === 'out' && new Date(r.expected_return_at).getTime() < Date.now();

  const memberName = (r: Signout) => r.members ? `${r.members.first_name} ${r.members.last_name}` : 'Unknown member';

  return (
    <AdminLayout title="Water Sign-Outs">
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A202C', marginBottom: 12 }}>
            Currently out ({out.length})
          </h2>
          {out.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8', marginBottom: 32 }}>
              <Anchor size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <p style={{ fontSize: 14 }}>Nobody currently signed out.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
              {out.map(r => {
                const overdue = isOverdue(r);
                return (
                  <div key={r.id} style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '14px 18px',
                    background: overdue ? '#FEF2F2' : '#FFFFFF', border: `1px solid ${overdue ? '#FECACA' : '#E2E8F0'}`, borderRadius: 8,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A202C' }}>{memberName(r)}</span>
                        <span style={{ fontSize: 11, color: '#64748B' }}>{r.members?.membership_number}</span>
                        {overdue && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', border: '1px solid #FECACA', padding: '2px 8px', borderRadius: 4 }}>
                            <AlertTriangle size={11} /> OVERDUE
                          </span>
                        )}
                        {r.source === 'whatsapp' && (
                          <span style={{ fontSize: 11, color: '#065F46', background: '#D1FAE5', padding: '2px 8px', borderRadius: 4 }}>via WhatsApp</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: '#475569' }}>
                        <Anchor size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                        {r.boat_name}
                        <span style={{ marginLeft: 14 }}>
                          <Users size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                          {r.passenger_count} aboard{r.passenger_note ? ` — ${r.passenger_note}` : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                        {r.contact_phone && <>{r.contact_phone} · </>}
                        Departed {format(new Date(r.departure_at), 'd MMM, HH:mm')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: overdue ? '#991B1B' : '#1A202C' }}>
                        <Clock size={13} /> Due {format(new Date(r.expected_return_at), 'HH:mm')}
                      </div>
                      {r.emergency_contact_name && (
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          Emergency: {r.emergency_contact_name} {r.emergency_contact_phone}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A202C', marginBottom: 12 }}>Recent sign-ins</h2>
          {recent.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8' }}>No sign-ins yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recent.slice(0, 20).map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 18px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                  <div style={{ flex: 1, fontSize: 13, color: '#334155' }}>
                    <strong>{memberName(r)}</strong> — {r.boat_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>
                    {r.actual_return_at ? format(new Date(r.actual_return_at), 'd MMM, HH:mm') : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
