import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
}

interface MemberDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  member?: MemberRow | null;
  onSuccess: () => void;
}

interface FormState {
  first_name: string;
  last_name: string;
  membership_number: string;
  email: string;
  phone: string;
  membership_type: string;
  partner_first_name: string;
  partner_last_name: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  first_name: '',
  last_name: '',
  membership_number: '',
  email: '',
  phone: '',
  membership_type: 'ordinary',
  partner_first_name: '',
  partner_last_name: '',
  is_active: true,
};

export default function MemberDrawer({ isOpen, onClose, venueId, member, onSuccess }: MemberDrawerProps) {
  const isEdit = !!member;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (member) {
        setForm({
          first_name: member.first_name,
          last_name: member.last_name,
          membership_number: member.membership_number,
          email: member.email || '',
          phone: member.phone || '',
          membership_type: member.membership_type,
          partner_first_name: member.partner_first_name || '',
          partner_last_name: member.partner_last_name || '',
          is_active: member.is_active,
        });
      } else {
        setForm(emptyForm);
      }
      setErrors({});
    }
  }, [isOpen, member]);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.first_name.trim()) e.first_name = 'First name is required';
    if (!form.last_name.trim()) e.last_name = 'Last name is required';
    if (!form.membership_number.trim()) e.membership_number = 'Membership number is required';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'Invalid email format';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);

    const record = {
      venue_id: venueId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      membership_number: form.membership_number.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      membership_type: form.membership_type,
      partner_first_name: form.partner_first_name.trim() || null,
      partner_last_name: form.partner_last_name.trim() || null,
      is_active: form.is_active,
    };

    let error;
    if (isEdit && member) {
      ({ error } = await supabase.from('members').update(record).eq('id', member.id).eq('venue_id', venueId));
    } else {
      ({ error } = await supabase.from('members').insert(record));
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
