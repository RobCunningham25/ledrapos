import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { AlertTriangle, ArrowDown, ArrowUp, Mail, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { normaliseSaNumber } from './waterUtils';

interface Contact {
  id: string;
  name: string;
  whatsapp_number: string | null;
  email: string | null;
  is_active: boolean;
  sort_order: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SafetyContactsPanel() {
  const { venueId } = useVenue();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!venueId) return;
    const { data, error } = await supabase
      .from('water_safety_contacts')
      .select('id, name, whatsapp_number, email, is_active, sort_order')
      .eq('venue_id', venueId)
      .order('sort_order');
    if (error) toast.error('Could not load safety contacts');
    else setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { load(); }, [load]);

  const openForm = (c: Contact | 'new') => {
    setEditing(c);
    setName(c === 'new' ? '' : c.name);
    setWhatsapp(c === 'new' ? '' : c.whatsapp_number ?? '');
    setEmail(c === 'new' ? '' : c.email ?? '');
  };

  const save = async () => {
    if (!venueId || !editing) return;
    const trimmedName = name.trim();
    if (!trimmedName) { toast.error('Name is required'); return; }
    let wa: string | null = null;
    if (whatsapp.trim()) {
      wa = normaliseSaNumber(whatsapp.trim());
      if (!wa) { toast.error('WhatsApp number looks invalid — use e.g. 082 123 4567 or +27821234567'); return; }
    }
    const mail = email.trim() || null;
    if (mail && !EMAIL_RE.test(mail)) { toast.error('Email address looks invalid'); return; }
    if (!wa && !mail) { toast.error('Add a WhatsApp number or an email — a contact needs at least one'); return; }

    setSaving(true);
    const payload = { name: trimmedName, whatsapp_number: wa, email: mail };
    const { error } = editing === 'new'
      ? await supabase.from('water_safety_contacts').insert({
          ...payload,
          venue_id: venueId,
          sort_order: contacts.length ? Math.max(...contacts.map(c => c.sort_order)) + 1 : 0,
        })
      : await supabase.from('water_safety_contacts').update(payload).eq('id', editing.id).eq('venue_id', venueId);
    setSaving(false);
    if (error) { toast.error('Could not save contact'); return; }
    toast.success('Contact saved');
    setEditing(null);
    load();
  };

  const toggleActive = async (c: Contact, is_active: boolean) => {
    setContacts(cs => cs.map(x => (x.id === c.id ? { ...x, is_active } : x)));
    const { error } = await supabase.from('water_safety_contacts')
      .update({ is_active }).eq('id', c.id).eq('venue_id', venueId!);
    if (error) { toast.error('Could not update contact'); load(); }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const a = contacts[index];
    const b = contacts[index + dir];
    if (!a || !b) return;
    // Swap positions; if sort_orders collide, fall back to index-based values.
    const collide = a.sort_order === b.sort_order;
    const aOrder = collide ? index + dir : b.sort_order;
    const bOrder = collide ? index : a.sort_order;
    const [r1, r2] = await Promise.all([
      supabase.from('water_safety_contacts').update({ sort_order: aOrder }).eq('id', a.id).eq('venue_id', venueId!),
      supabase.from('water_safety_contacts').update({ sort_order: bOrder }).eq('id', b.id).eq('venue_id', venueId!),
    ]);
    if (r1.error || r2.error) toast.error('Could not reorder');
    load();
  };

  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('water_safety_contacts')
      .delete().eq('id', deleting.id).eq('venue_id', venueId!);
    setDeleting(null);
    if (error) toast.error('Could not delete contact');
    else { toast.success('Contact removed'); load(); }
  };

  const active = contacts.filter(c => c.is_active);
  const activeWa = active.filter(c => c.whatsapp_number);
  const distinctWa = new Set(activeWa.map(c => c.whatsapp_number));
  const warnings: string[] = [];
  if (active.length === 0) warnings.push('No active contacts — an overdue trip will alert NOBODY.');
  else if (active.length < 2) warnings.push('Only one active contact — add at least two so there is no single point of failure.');
  if (activeWa.length > 1 && distinctWa.size < 2) warnings.push('All active contacts share the same WhatsApp number.');
  if (active.length > 0 && activeWa.length === 0) warnings.push('No active contact has a WhatsApp number — alerts will be email only.');
  if (active.length > 0 && !active.some(c => c.email)) warnings.push('No active contact has an email address — email alerts will not be sent.');

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-xl">
          These people are alerted when a trip is overdue and the member has not responded to their
          reminder, or when a member taps &ldquo;need help&rdquo;.
        </p>
        <Button onClick={() => openForm('new')}><Plus className="h-4 w-4 mr-1" /> Add contact</Button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-1">
          {warnings.map(w => (
            <p key={w} className="text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {contacts.length === 0 && <p className="text-sm text-muted-foreground">No safety contacts yet.</p>}
        {contacts.map((c, i) => (
          <div key={c.id} className={`flex items-center gap-3 flex-wrap bg-card rounded-lg border border-border p-4 ${c.is_active ? '' : 'opacity-60'}`}>
            <div className="flex flex-col">
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Move down" disabled={i === contacts.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="text-xs text-muted-foreground flex gap-4 flex-wrap mt-0.5">
                {c.whatsapp_number && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{c.whatsapp_number}</span>}
                {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`active-${c.id}`} className="text-xs text-muted-foreground">Active</Label>
              <Switch id={`active-${c.id}`} checked={c.is_active} onCheckedChange={v => toggleActive(c, v)} />
            </div>
            <Button variant="outline" size="icon" aria-label="Edit" onClick={() => openForm(c)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" aria-label="Delete" onClick={() => setDeleting(c)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add safety contact' : 'Edit safety contact'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="sc-name">Name</Label><Input id="sc-name" value={name} onChange={e => setName(e.target.value)} /></div>
            <div>
              <Label htmlFor="sc-wa">WhatsApp number</Label>
              <Input id="sc-wa" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="082 123 4567" />
              <p className="text-xs text-muted-foreground mt-1">Saved as +27… automatically.</p>
            </div>
            <div><Label htmlFor="sc-email">Email</Label><Input id="sc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>They will no longer be alerted about overdue trips. To keep them on file, switch them to inactive instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
