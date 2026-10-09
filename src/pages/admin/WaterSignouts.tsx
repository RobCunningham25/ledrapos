import { useState, useEffect, useCallback, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Anchor, Users, Clock, AlertTriangle, LogIn, Pencil, Search } from 'lucide-react';
import SafetyContactsPanel from '@/components/admin/water/SafetyContactsPanel';
import WaterSettingsPanel from '@/components/admin/water/WaterSettingsPanel';
import { MAX_TRIP_HOURS, toLocalInputValue } from '@/components/admin/water/waterUtils';

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
  reminder_sent_at: string | null;
  help_requested_at: string | null;
  snooze_count: number;
  source: 'portal' | 'whatsapp';
  members: { first_name: string; last_name: string; membership_number: string } | null;
}

const HISTORY_PAGE = 100;

export default function WaterSignouts() {
  const { venueId } = useVenue();
  const [rows, setRows] = useState<Signout[]>([]);
  const [loading, setLoading] = useState(true);

  const [history, setHistory] = useState<Signout[]>([]);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('out');

  const [signingIn, setSigningIn] = useState<Signout | null>(null);
  const [editing, setEditing] = useState<Signout | null>(null);
  const [newReturn, setNewReturn] = useState('');
  const [busy, setBusy] = useState(false);

  const SELECT = 'id, boat_name, passenger_count, passenger_note, contact_phone, emergency_contact_name, emergency_contact_phone, departure_at, expected_return_at, actual_return_at, status, overdue_alert_sent_at, reminder_sent_at, help_requested_at, snooze_count, source, members(first_name, last_name, membership_number)';

  const fetchOpen = useCallback(async () => {
    if (!venueId) return;
    const { data, error } = await supabase
      .from('water_signouts')
      .select(SELECT)
      .eq('venue_id', venueId)
      .eq('status', 'out')
      .order('expected_return_at', { ascending: true });
    if (!error) setRows((data as unknown as Signout[]) ?? []);
    setLoading(false);
  }, [venueId]);

  const fetchHistory = useCallback(async () => {
    if (!venueId) return;
    const { data, error } = await supabase
      .from('water_signouts')
      .select(SELECT)
      .eq('venue_id', venueId)
      .eq('status', 'in')
      .order('departure_at', { ascending: false })
      .limit(historyLimit);
    if (!error) setHistory((data as unknown as Signout[]) ?? []);
    setHistoryLoaded(true);
  }, [venueId, historyLimit]);

  useEffect(() => { fetchOpen(); }, [fetchOpen]);
  useEffect(() => {
    const id = setInterval(fetchOpen, 30000);
    return () => clearInterval(id);
  }, [fetchOpen]);
  useEffect(() => { if (tab === 'history') fetchHistory(); }, [tab, fetchHistory]);

  const isOverdue = (r: Signout) => r.status === 'out' && new Date(r.expected_return_at).getTime() < Date.now();
  const memberName = (r: Signout) => r.members ? `${r.members.first_name} ${r.members.last_name}` : 'Unknown member';

  const overdueCount = rows.filter(isOverdue).length;

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter(r =>
      memberName(r).toLowerCase().includes(q) ||
      r.boat_name.toLowerCase().includes(q) ||
      (r.members?.membership_number ?? '').toLowerCase().includes(q));
  }, [history, search]);

  // Quiet by design: updates the row directly, sends no WhatsApp or email.
  const confirmSignIn = async () => {
    if (!signingIn || !venueId) return;
    setBusy(true);
    const { data, error } = await supabase.from('water_signouts')
      .update({ status: 'in', actual_return_at: new Date().toISOString() })
      .eq('id', signingIn.id).eq('venue_id', venueId).eq('status', 'out')
      .select('id');
    setBusy(false);
    setSigningIn(null);
    if (error || !data?.length) { toast.error('Could not sign in — it may already be signed in.'); }
    else toast.success('Signed in');
    fetchOpen();
  };

  const openEdit = (r: Signout) => {
    setEditing(r);
    setNewReturn(toLocalInputValue(new Date(r.expected_return_at)));
  };

  const saveReturn = async () => {
    if (!editing || !venueId) return;
    const ms = new Date(newReturn).getTime();
    if (isNaN(ms)) { toast.error('Please set a return time'); return; }
    if (ms > Date.now() + MAX_TRIP_HOURS * 3600_000) {
      toast.error(`Return time must be within ${MAX_TRIP_HOURS} hours from now.`);
      return;
    }
    setBusy(true);
    // Clear reminder_sent_at so a fresh reminder fires against the new time
    // (same as the member's "still out" snooze).
    const { error } = await supabase.from('water_signouts')
      .update({ expected_return_at: new Date(ms).toISOString(), reminder_sent_at: null, overdue_alert_sent_at: null })
      .eq('id', editing.id).eq('venue_id', venueId).eq('status', 'out');
    setBusy(false);
    if (error) { toast.error(error.code === '23514' ? error.message : 'Could not update return time'); return; }
    toast.success('Return time updated');
    setEditing(null);
    fetchOpen();
  };

  const SourceBadge = ({ r }: { r: Signout }) => r.source === 'whatsapp'
    ? <span style={{ fontSize: 11, color: '#065F46', background: '#D1FAE5', padding: '2px 8px', borderRadius: 4 }}>via WhatsApp</span>
    : null;

  return (
    <AdminLayout title="Water Sign-Outs">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="out">
            On the water ({rows.length}){overdueCount > 0 && <span style={{ color: '#991B1B', marginLeft: 6 }}>· {overdueCount} overdue</span>}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="contacts">Safety contacts</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ===== On the water ===== */}
        <TabsContent value="out">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
              <Anchor size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <p style={{ fontSize: 14 }}>Nobody currently signed out.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(r => {
                const overdue = isOverdue(r);
                return (
                  <div key={r.id} style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '14px 18px',
                    background: overdue ? '#FEF2F2' : '#FFFFFF', border: `1px solid ${overdue ? '#FECACA' : '#E2E8F0'}`, borderRadius: 8,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A202C' }}>{memberName(r)}</span>
                        <span style={{ fontSize: 11, color: '#64748B' }}>{r.members?.membership_number}</span>
                        {r.help_requested_at ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#FFFFFF', background: '#991B1B', padding: '2px 8px', borderRadius: 4 }}>
                            <AlertTriangle size={11} /> HELP REQUESTED
                          </span>
                        ) : overdue && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', border: '1px solid #FECACA', padding: '2px 8px', borderRadius: 4 }}>
                            <AlertTriangle size={11} /> OVERDUE
                          </span>
                        )}
                        {r.overdue_alert_sent_at && (
                          <span style={{ fontSize: 11, color: '#991B1B', background: '#FEE2E2', padding: '2px 8px', borderRadius: 4 }}>
                            safety contacts alerted {format(new Date(r.overdue_alert_sent_at), 'HH:mm')}
                          </span>
                        )}
                        <SourceBadge r={r} />
                        {r.snooze_count > 0 && (
                          <span style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 4 }}>
                            snoozed {r.snooze_count}&times;
                          </span>
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
                        {r.reminder_sent_at && !r.help_requested_at && <> &middot; reminder sent</>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, fontSize: 13, fontWeight: 600, color: overdue ? '#991B1B' : '#1A202C' }}>
                        <Clock size={13} /> Due {format(new Date(r.expected_return_at), 'd MMM, HH:mm')}
                      </div>
                      {r.emergency_contact_name && (
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          Emergency: {r.emergency_contact_name} {r.emergency_contact_phone}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5 mr-1" /> Return time</Button>
                      <Button size="sm" onClick={() => setSigningIn(r)}><LogIn className="h-3.5 w-3.5 mr-1" /> Sign in</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ===== History ===== */}
        <TabsContent value="history">
          <div style={{ position: 'relative', maxWidth: 360, marginBottom: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94A3B8' }} />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search member, boat or number" style={{ paddingLeft: 30 }} />
          </div>
          {!historyLoaded ? (
            <Skeleton className="h-32 w-full" />
          ) : filteredHistory.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8' }}>{search ? 'No matching trips.' : 'No sign-ins yet.'}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredHistory.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: '10px 18px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: '#334155' }}>
                    <strong>{memberName(r)}</strong> — {r.boat_name}
                    <span style={{ marginLeft: 10, color: '#94A3B8' }}>{r.passenger_count} aboard</span>
                    {r.overdue_alert_sent_at && (
                      <span style={{ marginLeft: 10, fontSize: 11, color: '#991B1B', background: '#FEE2E2', padding: '2px 8px', borderRadius: 4 }}>was escalated</span>
                    )}
                    {r.help_requested_at && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#FFFFFF', background: '#991B1B', padding: '2px 8px', borderRadius: 4 }}>help requested</span>
                    )}
                    <span style={{ marginLeft: 8 }}><SourceBadge r={r} /></span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>
                    {format(new Date(r.departure_at), 'd MMM, HH:mm')} → {r.actual_return_at ? format(new Date(r.actual_return_at), 'd MMM, HH:mm') : '—'}
                  </div>
                </div>
              ))}
              {history.length >= historyLimit && !search && (
                <Button variant="outline" onClick={() => setHistoryLimit(l => l + HISTORY_PAGE)} style={{ alignSelf: 'center', marginTop: 8 }}>
                  Load more
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contacts"><SafetyContactsPanel /></TabsContent>
        <TabsContent value="settings"><WaterSettingsPanel /></TabsContent>
      </Tabs>

      {/* Sign-in confirmation */}
      <AlertDialog open={!!signingIn} onOpenChange={o => !o && setSigningIn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign {signingIn ? memberName(signingIn) : ''} in?</AlertDialogTitle>
            <AlertDialogDescription>
              Only do this once you know they are back safely. It closes the trip quietly — no message is sent to the member or the safety contacts, and any pending alert is cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSignIn} disabled={busy}>Sign in</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit return time */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change return time</DialogTitle>
            <DialogDescription>
              {editing ? `${memberName(editing)} — ${editing.boat_name}. ` : ''}
              Must be within {MAX_TRIP_HOURS} hours from now. A new reminder will be sent if they&rsquo;re still out at that time.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="ws-return">Expected return</Label>
            <Input id="ws-return" type="datetime-local" value={newReturn} onChange={e => setNewReturn(e.target.value)}
              max={toLocalInputValue(new Date(Date.now() + MAX_TRIP_HOURS * 3600_000))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveReturn} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
