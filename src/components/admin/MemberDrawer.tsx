import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MemberRow {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  membership_type: string;
  email: string | null;
  phone: string | null;
  partner_name: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
  is_active: boolean;
  auth_user_id: string | null;
  whatsapp_number?: string | null;
  whatsapp_opt_in?: boolean;
  whatsapp_opt_in_at?: string | null;
  whatsapp_opt_in_method?: string | null;
  whatsapp_opt_out_at?: string | null;
}

interface MemberDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  member?: MemberRow | null;
  onSuccess: () => void;
}

// Sites/sheds are rows in member_sites / member_boat_sheds (a member can have
// several of each). In edit mode changes hit the DB immediately, mirroring the
// Details tab; in add mode they're collected locally (id: null) and inserted
// after the member row exists.
interface MultiRow {
  id: string | null;
  value: string;
}

interface FormState {
  first_name: string;
  last_name: string;
  membership_number: string;
  email: string;
  phone: string;
  home_address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  membership_type: string;
  partner_first_name: string;
  partner_last_name: string;
  partner_email: string;
  partner_phone: string;
  is_active: boolean;
  whatsapp_number: string;
  whatsapp_manual_opt_out: boolean;
}

const emptyForm: FormState = {
  first_name: '',
  last_name: '',
  membership_number: '',
  email: '',
  phone: '',
  home_address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  membership_type: 'ordinary',
  partner_first_name: '',
  partner_last_name: '',
  partner_email: '',
  partner_phone: '',
  is_active: true,
  whatsapp_number: '',
  whatsapp_manual_opt_out: false,
};

export default function MemberDrawer({ isOpen, onClose, venueId, member, onSuccess }: MemberDrawerProps) {
  const isEdit = !!member;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  const [sites, setSites] = useState<MultiRow[]>([]);
  const [sheds, setSheds] = useState<MultiRow[]>([]);
  const [newSite, setNewSite] = useState('');
  const [newShed, setNewShed] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (member) {
        setForm({
          first_name: member.first_name,
          last_name: member.last_name,
          membership_number: member.membership_number,
          email: member.email || '',
          phone: member.phone || '',
          home_address: '',
          emergency_contact_name: '',
          emergency_contact_phone: '',
          membership_type: member.membership_type,
          partner_first_name: member.partner_first_name || '',
          partner_last_name: member.partner_last_name || '',
          partner_email: '',
          partner_phone: '',
          is_active: member.is_active,
          whatsapp_number: member.whatsapp_number || member.phone || '',
          whatsapp_manual_opt_out: !!member.whatsapp_opt_out_at && !member.whatsapp_opt_in,
        });
        // The members-list RPC doesn't return these columns — fetch them directly.
        supabase
          .from('members')
          .select('emergency_contact_name, emergency_contact_phone, partner_email, partner_phone, home_address')
          .eq('id', member.id)
          .eq('venue_id', venueId)
          .single()
          .then(({ data }) => {
            if (data) {
              setForm(prev => ({
                ...prev,
                home_address: data.home_address || '',
                emergency_contact_name: data.emergency_contact_name || '',
                emergency_contact_phone: data.emergency_contact_phone || '',
                partner_email: data.partner_email || '',
                partner_phone: data.partner_phone || '',
              }));
            }
          });
        supabase
          .from('member_sites')
          .select('id, site_number')
          .eq('member_id', member.id)
          .eq('venue_id', venueId)
          .order('created_at')
          .then(({ data }) => {
            setSites(((data as { id: string; site_number: string }[]) || []).map(r => ({ id: r.id, value: r.site_number })));
          });
        supabase
          .from('member_boat_sheds')
          .select('id, shed_number')
          .eq('member_id', member.id)
          .eq('venue_id', venueId)
          .order('created_at')
          .then(({ data }) => {
            setSheds(((data as { id: string; shed_number: string }[]) || []).map(r => ({ id: r.id, value: r.shed_number })));
          });
      } else {
        setForm(emptyForm);
        setSites([]);
        setSheds([]);
      }
      setNewSite('');
      setNewShed('');
      setErrors({});
    }
  }, [isOpen, member, venueId]);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const addSite = async () => {
    const value = newSite.trim();
    if (!value) return;
    if (isEdit && member) {
      const { data, error } = await supabase
        .from('member_sites')
        .insert({ venue_id: venueId, member_id: member.id, site_number: value })
        .select('id')
        .single();
      if (error) { toast.error('Failed to add site'); return; }
      setSites(prev => [...prev, { id: data.id, value }]);
    } else {
      setSites(prev => [...prev, { id: null, value }]);
    }
    setNewSite('');
  };

  const removeSite = async (index: number) => {
    const row = sites[index];
    if (row.id) {
      const { error } = await supabase.from('member_sites').delete().eq('id', row.id);
      if (error) { toast.error('Failed to remove site'); return; }
    }
    setSites(prev => prev.filter((_, i) => i !== index));
  };

  const addShed = async () => {
    const value = newShed.trim();
    if (!value) return;
    if (isEdit && member) {
      const { data, error } = await supabase
        .from('member_boat_sheds')
        .insert({ venue_id: venueId, member_id: member.id, shed_number: value })
        .select('id')
        .single();
      if (error) { toast.error('Failed to add shed'); return; }
      setSheds(prev => [...prev, { id: data.id, value }]);
    } else {
      setSheds(prev => [...prev, { id: null, value }]);
    }
    setNewShed('');
  };

  const removeShed = async (index: number) => {
    const row = sheds[index];
    if (row.id) {
      const { error } = await supabase.from('member_boat_sheds').delete().eq('id', row.id);
      if (error) { toast.error('Failed to remove shed'); return; }
    }
    setSheds(prev => prev.filter((_, i) => i !== index));
  };

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.first_name.trim()) e.first_name = 'First name is required';
    if (!form.last_name.trim()) e.last_name = 'Last name is required';
    if (!form.membership_number.trim()) e.membership_number = 'Membership number is required';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'Invalid email format';
    }
    if (form.partner_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.partner_email.trim())) {
      e.partner_email = 'Invalid email format';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);

    // Compose WhatsApp opt-out fields. Admin can flip an opted-in member to opted-out
    // here (e.g. someone phoned in to unsubscribe); we don't allow manually opting
    // someone in — that has to come from the member themselves via the webhook.
    const wasOptedIn = !!member?.whatsapp_opt_in;
    const flipToOptOut = form.whatsapp_manual_opt_out && wasOptedIn;
    const clearOptOut = !form.whatsapp_manual_opt_out && !!member?.whatsapp_opt_out_at && !member?.whatsapp_opt_in;

    const record: Record<string, unknown> = {
      venue_id: venueId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      membership_number: form.membership_number.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      home_address: form.home_address.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      membership_type: form.membership_type,
      partner_first_name: form.partner_first_name.trim() || null,
      partner_last_name: form.partner_last_name.trim() || null,
      partner_email: form.partner_email.trim() || null,
      partner_phone: form.partner_phone.trim() || null,
      is_active: form.is_active,
      whatsapp_number: form.whatsapp_number.trim() || null,
    };
    if (flipToOptOut) {
      record.whatsapp_opt_in = false;
      record.whatsapp_opt_out_at = new Date().toISOString();
    } else if (clearOptOut) {
      record.whatsapp_opt_out_at = null;
    }

    let error;
    if (isEdit && member) {
      ({ error } = await supabase.from('members').update(record).eq('id', member.id).eq('venue_id', venueId));
    } else {
      const { data: created, error: insertError } = await supabase
        .from('members')
        .insert(record)
        .select('id')
        .single();
      error = insertError;
      // Flush sites/sheds collected before the member existed.
      if (!error && created) {
        const pendingSites = sites.filter(s => !s.id).map(s => ({ venue_id: venueId, member_id: created.id, site_number: s.value }));
        const pendingSheds = sheds.filter(s => !s.id).map(s => ({ venue_id: venueId, member_id: created.id, shed_number: s.value }));
        const [siteRes, shedRes] = await Promise.all([
          pendingSites.length ? supabase.from('member_sites').insert(pendingSites) : Promise.resolve({ error: null }),
          pendingSheds.length ? supabase.from('member_boat_sheds').insert(pendingSheds) : Promise.resolve({ error: null }),
        ]);
        if (siteRes.error || shedRes.error) {
          toast.error('Member saved, but some sites/sheds failed to save — edit the member to retry');
        }
      }
    }

    setSaving(false);

    if (error) {
      if (error.message?.includes('duplicate key') || error.message?.includes('unique') || error.code === '23505') {
        setErrors(prev => ({ ...prev, membership_number: 'This membership number is already in use' }));
      } else {
        toast.error('Failed to save member — please try again');
      }
      return;
    }

    toast.success(isEdit ? 'Member updated' : 'Member added');
    onSuccess();
    onClose();
  }

  if (!isOpen) return null;

  const field = (label: string, key: keyof FormState, opts?: { type?: string; helper?: string; placeholder?: string }) => (
    <div>
      <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>{label}</Label>
      <Input
        type={opts?.type || 'text'}
        value={form[key] as string}
        onChange={e => set(key, e.target.value)}
        placeholder={opts?.placeholder}
        className="mt-1"
        style={{ height: 44, borderRadius: 6, fontSize: 14 }}
      />
      {opts?.helper && !errors[key] && (
        <p style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>{opts.helper}</p>
      )}
      {errors[key] && <p style={{ fontSize: 12, color: '#C0392B', marginTop: 4 }}>{errors[key]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[480px] h-full bg-card shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="text-lg font-semibold text-foreground">
            {isEdit ? 'Edit Member' : 'Add Member'}
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {field('First Name', 'first_name', { placeholder: 'e.g. John' })}
          {field('Last Name', 'last_name', { placeholder: 'e.g. Smith' })}
          {field('Membership Number', 'membership_number', {
            placeholder: 'e.g. VCA-006',
            helper: 'Must be unique within this venue (e.g. VCA-006)',
          })}
          {field('Email', 'email', { type: 'email', placeholder: 'john@example.com', helper: 'Required for portal access' })}
          {field('Phone', 'phone', { placeholder: '+27 82 123 4567' })}

          <div>
            <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Home Address</Label>
            <Textarea
              value={form.home_address}
              onChange={e => set('home_address', e.target.value)}
              placeholder="Street, suburb, town, postal code"
              rows={2}
              className="mt-1"
              style={{ borderRadius: 6, fontSize: 14 }}
            />
          </div>

          {field('Emergency Contact Name', 'emergency_contact_name', { placeholder: 'e.g. Jane Smith' })}
          {field('Emergency Contact Phone', 'emergency_contact_phone', { placeholder: '+27 82 123 4567' })}

          <div>
            <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Membership Type</Label>
            <Select value={form.membership_type} onValueChange={v => set('membership_type', v)}>
              <SelectTrigger className="mt-1" style={{ height: 44, borderRadius: 6, fontSize: 14 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ordinary">Ordinary</SelectItem>
                <SelectItem value="pensioner">Pensioner</SelectItem>
                <SelectItem value="honorary">Honorary</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="associate">Associate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {field('Partner First Name', 'partner_first_name', {
            placeholder: 'Partner first name',
            helper: 'Spouse or partner associated with this membership',
          })}
          {field('Partner Last Name', 'partner_last_name', {
            placeholder: 'Partner last name',
          })}
          {field('Partner Email', 'partner_email', {
            type: 'email',
            placeholder: 'partner@example.com',
            helper: 'Partners with an email address receive club broadcast emails',
          })}
          {field('Partner Cellphone', 'partner_phone', {
            placeholder: '+27 82 123 4567',
            helper: 'Partners can message the club WhatsApp number from this phone',
          })}

          {/* ===== Sites & boat sheds ===== */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16, marginTop: 8 }}>
            <Label style={{ fontSize: 14, fontWeight: 600, color: '#1A202C' }}>Site Numbers</Label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {sites.length === 0 && <p style={{ fontSize: 12, color: '#718096' }}>No sites added</p>}
              {sites.map((s, i) => (
                <span key={s.id ?? `new-${i}`} className="inline-flex items-center gap-1" style={{ fontSize: 13, color: '#1A202C', background: '#F4F6F9', border: '1px solid #E2E8F0', borderRadius: 16, padding: '4px 12px' }}>
                  {s.value}
                  <button type="button" onClick={() => removeSite(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', display: 'flex', alignItems: 'center' }}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Site number"
                value={newSite}
                onChange={e => setNewSite(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSite(); } }}
                style={{ height: 40, borderRadius: 6, fontSize: 14, width: 160 }}
              />
              <Button type="button" onClick={addSite} style={{ height: 36, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 500, borderRadius: 6, paddingLeft: 14, paddingRight: 14 }}>Add</Button>
            </div>

            <Label style={{ fontSize: 14, fontWeight: 600, color: '#1A202C', display: 'block', marginTop: 16 }}>Boat Shed Numbers</Label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {sheds.length === 0 && <p style={{ fontSize: 12, color: '#718096' }}>No sheds added</p>}
              {sheds.map((s, i) => (
                <span key={s.id ?? `new-${i}`} className="inline-flex items-center gap-1" style={{ fontSize: 13, color: '#1A202C', background: '#F4F6F9', border: '1px solid #E2E8F0', borderRadius: 16, padding: '4px 12px' }}>
                  {s.value}
                  <button type="button" onClick={() => removeShed(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', display: 'flex', alignItems: 'center' }}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Shed number"
                value={newShed}
                onChange={e => setNewShed(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addShed(); } }}
                style={{ height: 40, borderRadius: 6, fontSize: 14, width: 160 }}
              />
              <Button type="button" onClick={addShed} style={{ height: 36, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 500, borderRadius: 6, paddingLeft: 14, paddingRight: 14 }}>Add</Button>
            </div>
            {isEdit && (
              <p style={{ fontSize: 12, color: '#718096', marginTop: 8 }}>Site and shed changes save immediately.</p>
            )}
          </div>

          {/* ===== WhatsApp section ===== */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16, marginTop: 8 }}>
            <Label style={{ fontSize: 14, fontWeight: 600, color: '#1A202C' }}>WhatsApp</Label>
            {field('WhatsApp number', 'whatsapp_number', {
              placeholder: '+27 82 123 4567',
              helper: 'Used for tab reminders and opt-in messages. Defaults to phone.',
            })}

            {isEdit && member && (
              <div style={{ marginTop: 10 }}>
                {member.whatsapp_opt_in ? (
                  <div style={{
                    background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6,
                    padding: '10px 12px', fontSize: 13, color: '#166534'
                  }}>
                    <strong>✓ Opted in</strong>
                    {member.whatsapp_opt_in_at && (
                      <span> on {new Date(member.whatsapp_opt_in_at).toLocaleString('en-ZA')}</span>
                    )}
                    {member.whatsapp_opt_in_method && <span> ({member.whatsapp_opt_in_method})</span>}
                    <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 13 }}>Manually opt this member out</span>
                      <Switch
                        checked={form.whatsapp_manual_opt_out}
                        onCheckedChange={v => set('whatsapp_manual_opt_out', v)}
                      />
                    </div>
                    {form.whatsapp_manual_opt_out && (
                      <p style={{ fontSize: 12, color: '#92400E', marginTop: 6 }}>
                        Saving will mark this member as opted out. They won't receive any further WhatsApp messages.
                      </p>
                    )}
                  </div>
                ) : member.whatsapp_opt_out_at ? (
                  <div style={{
                    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6,
                    padding: '10px 12px', fontSize: 13, color: '#991B1B'
                  }}>
                    <strong>Opted out</strong> on {new Date(member.whatsapp_opt_out_at).toLocaleString('en-ZA')}
                    <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 13 }}>Keep opt-out</span>
                      <Switch
                        checked={form.whatsapp_manual_opt_out}
                        onCheckedChange={v => set('whatsapp_manual_opt_out', v)}
                      />
                    </div>
                    {!form.whatsapp_manual_opt_out && (
                      <p style={{ fontSize: 12, color: '#92400E', marginTop: 6 }}>
                        Clearing the opt-out lets you re-send an opt-in invite. The member must still tap Yes.
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: '#718096', marginTop: 6 }}>
                    Not opted in yet. Use the "Send opt-in" button on the Members page.
                  </p>
                )}
              </div>
            )}
          </div>

          {isEdit && (
            <div>
              <div className="flex items-center justify-between py-1">
                <div>
                  <Label style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>Active member</Label>
                </div>
                <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
              </div>
              {!form.is_active && (
                <p style={{ fontSize: 12, color: '#C0392B', marginTop: 4 }}>
                  Inactive members cannot open tabs or access the portal
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 space-y-3">
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saving}
            style={{ height: 48, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6 }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Member'}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={onClose}
            style={{ height: 48, borderRadius: 6, fontWeight: 500 }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
