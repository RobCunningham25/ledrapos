import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { toast } from 'sonner';
import type { ElectricityMeterWithMember } from '@/hooks/useElectricityMeters';

interface MemberOption {
  id: string;
  name: string;
  membership_number: string;
  sites: string;
}

interface FormData {
  meterNumber: string;
  unitLabel: string;
  building: string;
  description: string;
  memberId: string | null;
}

function meterToForm(m: ElectricityMeterWithMember): FormData {
  return {
    meterNumber: m.meter_number,
    unitLabel: m.unit_label ?? '',
    building: m.building ?? '',
    description: m.description ?? '',
    memberId: m.member_id,
  };
}

const emptyForm: FormData = {
  meterNumber: '',
  unitLabel: '',
  building: '',
  description: '',
  memberId: null,
};

interface ElectricityMeterDrawerProps {
  open: boolean;
  meter: ElectricityMeterWithMember | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ElectricityMeterDrawer({ open, meter, onClose, onSaved }: ElectricityMeterDrawerProps) {
  const { venueId } = useVenue();
  const isEdit = !!meter;
  const [form, setForm] = useState<FormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    if (open) {
      setForm(meter ? meterToForm(meter) : emptyForm);
      setErrors({});
      setMemberSearch('');
    }
  }, [open, meter]);

  useEffect(() => {
    if (!open || !venueId) return;
    (async () => {
      const [{ data: memberRows }, { data: siteRows }] = await Promise.all([
        supabase.from('members').select('id, first_name, last_name, membership_number').eq('venue_id', venueId).order('last_name'),
        supabase.from('member_sites').select('member_id, site_number').eq('venue_id', venueId),
      ]);
      const sitesByMember = new Map<string, string[]>();
      for (const s of siteRows ?? []) {
        const list = sitesByMember.get(s.member_id) ?? [];
        list.push(s.site_number);
        sitesByMember.set(s.member_id, list);
      }
      setMembers(
        (memberRows ?? []).map((m) => ({
          id: m.id,
          name: `${m.first_name} ${m.last_name}`,
          membership_number: m.membership_number,
          sites: (sitesByMember.get(m.id) ?? []).join(', '),
        }))
      );
    })();
  }, [open, venueId]);

  const set = (key: keyof FormData, value: string | null) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.membership_number.toLowerCase().includes(q) || m.sites.includes(q)
    );
  }, [members, memberSearch]);

  const selectedMember = members.find((m) => m.id === form.memberId) ?? null;

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.meterNumber.trim()) e.meterNumber = 'Meter number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);

    const record = {
      venue_id: venueId,
      meter_number: form.meterNumber.trim(),
      unit_label: form.unitLabel.trim() || null,
      building: form.building.trim() || null,
      description: form.description.trim() || null,
      member_id: form.memberId,
    };

    let error;
    if (isEdit && meter) {
      ({ error } = await supabase.from('electricity_meters').update(record).eq('id', meter.id));
    } else {
      ({ error } = await supabase.from('electricity_meters').insert(record));
    }

    if (!error && isEdit && meter) {
      // electricity_purchases.member_id is denormalized off the meter's member_id for
      // fast portal lookups — keep it in lock-step whenever a meter is (re)mapped.
      await supabase.from('electricity_purchases').update({ member_id: form.memberId }).eq('meter_id', meter.id);
    }

    setSaving(false);
    if (error) {
      if (error.code === '23505') toast.error('A meter with this number already exists');
      else toast.error('Failed to save meter — please try again');
    } else {
      onSaved();
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[480px] h-full bg-card shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="text-lg font-semibold text-foreground">
            {isEdit ? 'Edit Meter' : 'Add Meter'}
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <Label className="text-sm font-medium">Meter Number</Label>
            <Input
              value={form.meterNumber}
              onChange={(e) => set('meterNumber', e.target.value)}
              placeholder="e.g. 54747952601"
              className={`mt-1 ${errors.meterNumber ? 'border-destructive' : ''}`}
            />
            {errors.meterNumber && <p className="text-xs text-destructive mt-1">{errors.meterNumber}</p>}
          </div>

          <div>
            <Label className="text-sm font-medium">Site Number</Label>
            <Input
              value={form.unitLabel}
              onChange={(e) => set('unitLabel', e.target.value)}
              placeholder="e.g. 18"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Building / Complex</Label>
            <Input
              value={form.building}
              onChange={(e) => set('building', e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Notes</Label>
            <Input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="e.g. names on the utility account"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Member</Label>
            {selectedMember ? (
              <div className="mt-1 flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedMember.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedMember.membership_number}
                    {selectedMember.sites && ` · Site${selectedMember.sites.includes(',') ? 's' : ''} ${selectedMember.sites}`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => set('memberId', null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search by name, membership # or site..."
                    className="pl-9"
                  />
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {filteredMembers.length === 0 && (
                    <p className="px-3 py-3 text-sm text-muted-foreground">No members found</p>
                  )}
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => set('memberId', m.id)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.membership_number}
                          {m.sites && ` · Site${m.sites.includes(',') ? 's' : ''} ${m.sites}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!selectedMember && form.memberId === null && isEdit && (
              <p className="text-xs text-muted-foreground mt-1">Leave unselected to unassign this meter.</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : <><Check className="h-4 w-4" /> {isEdit ? 'Save' : 'Add Meter'}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
