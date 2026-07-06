import { useState, useRef } from 'react';
import { useVenue } from '@/contexts/VenueContext';
import { supabase } from '@/integrations/supabase/client';
import {
  CATEGORY_FEES,
  ADDON_FEES,
  calculateFees,
  formatZAR,
  type MembershipCategory,
  type AddOnCategory,
  type AddOnMember,
} from '@/utils/membershipFees';
import { Loader2, Upload, X, Check, ChevronRight, ChevronLeft, Anchor, Plus } from 'lucide-react';

const T = {
  navy: '#1B3A4B',
  teal: '#2A9D8F',
  gold: '#D4A574',
  offWhite: '#FAF8F5',
  cardBg: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#1A202C',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  error: '#DC2626',
};

const card: React.CSSProperties = {
  background: T.cardBg,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 6 }}>
      {children}{required && <span style={{ color: T.error, marginLeft: 2 }}>*</span>}
    </label>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '9px 12px',
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        fontSize: 14,
        color: T.textPrimary,
        background: '#FFFFFF',
        boxSizing: 'border-box',
        outline: 'none',
        ...props.style,
      }}
    />
  );
}

function FieldTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: '100%',
        padding: '9px 12px',
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        fontSize: 14,
        color: T.textPrimary,
        background: '#FFFFFF',
        boxSizing: 'border-box',
        resize: 'vertical',
        minHeight: 80,
        outline: 'none',
        ...props.style,
      }}
    />
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Label required={required}>{label}</Label>
      {children}
    </div>
  );
}

function FeeRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13, color: muted ? '#4ADE80' : '#166534', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: 13, color: muted ? '#4ADE80' : '#166534', fontWeight: bold ? 700 : 600, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizePhone(val: string): string {
  const hasPlus = val.trimStart().startsWith('+');
  const digits = val.replace(/\D/g, '');
  return (hasPlus ? '+' : '') + digits;
}

function isValidEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim());
}

function isValidPhone(val: string): boolean {
  // Accept +27XXXXXXXXX or 0XXXXXXXXX (9 digits after prefix)
  return /^(\+27|0)\d{9}$/.test(val.replace(/\s/g, ''));
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function yearsAgo(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().split('T')[0];
}

// ─── Step 1: Category & Fees ────────────────────────────────────────────────

const CATEGORIES: MembershipCategory[] = ['ordinary', 'social', 'crew_visitor'];

function StepCategory({
  selected,
  onSelect,
  addons,
  onAddonsChange,
}: {
  selected: MembershipCategory | null;
  onSelect: (c: MembershipCategory) => void;
  addons: AddOnMember[];
  onAddonsChange: (a: AddOnMember[]) => void;
}) {
  const fees = selected ? calculateFees(selected, addons) : null;

  const addAddon = (category: AddOnCategory) => {
    onAddonsChange([...addons, { category, name: '', dob: '' }]);
  };

  const updateAddon = (i: number, field: keyof AddOnMember, value: string) => {
    const next = [...addons];
    next[i] = { ...next[i], [field]: value };
    onAddonsChange(next);
  };

  const removeAddon = (i: number) => {
    onAddonsChange(addons.filter((_, idx) => idx !== i));
  };

  const intermediateCount = addons.filter((a) => a.category === 'intermediate').length;
  const canAddIntermediate = intermediateCount < 1; // max 1 intermediate add-on
  const canAddJunior = addons.filter((a) => a.category === 'junior').length < 6;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.navy, marginBottom: 4 }}>Membership Category</h2>
      <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 24 }}>
        Select the membership type that applies to you. Annual subscriptions are pro-rated from the current month to end of April.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {CATEGORIES.map((cat) => {
          const info = CATEGORY_FEES[cat];
          const active = selected === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => { onSelect(cat); if (cat !== 'ordinary') onAddonsChange([]); }}
              style={{
                textAlign: 'left',
                padding: '14px 16px',
                border: `2px solid ${active ? T.teal : T.border}`,
                borderRadius: 8,
                background: active ? 'rgba(42,157,143,0.06)' : T.cardBg,
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: active ? T.teal : T.textPrimary }}>{info.label}</div>
                  <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 3, lineHeight: 1.4 }}>{info.description}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 120 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>{formatZAR(info.annualCents)}/yr</div>
                  {info.joiningFeeCents > 0 && (
                    <div style={{ fontSize: 11, color: T.error, fontWeight: 600 }}>
                      + {formatZAR(info.joiningFeeCents)} joining fee
                    </div>
                  )}
                  {info.landLevyCents > 0 && (
                    <div style={{ fontSize: 11, color: T.textMuted }}>
                      + {formatZAR(info.landLevyCents)} levy/yr (first 5 yrs)
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Add-on members — Ordinary only */}
      {selected === 'ordinary' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.navy, marginBottom: 6 }}>Add-on family members</div>
          <p style={{ fontSize: 13, color: T.textSecondary, marginBottom: 14 }}>
            As an Ordinary Member you may add your children to your membership at reduced rates.
            Intermediate (19–30) and Junior (12–18) members are attached to your application.
          </p>

          {addons.map((addon, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-end', padding: '12px 14px', background: '#F8FAFC', border: `1px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ width: 130, flexShrink: 0 }}>
                <Label>{ADDON_FEES[addon.category].label}</Label>
                <div style={{ fontSize: 12, padding: '9px 10px', border: `1px solid ${T.border}`, borderRadius: 6, background: '#F1F5F9', color: T.textSecondary }}>
                  {addon.category === 'intermediate' ? '19–30 yrs' : '12–18 yrs'}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <Label required>Full name</Label>
                <FieldInput
                  value={addon.name}
                  onChange={(e) => updateAddon(i, 'name', e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div style={{ width: 140 }}>
                <Label>Date of birth</Label>
                <FieldInput
                  type="date"
                  value={addon.dob}
                  onChange={(e) => updateAddon(i, 'dob', e.target.value)}
                  min={addon.category === 'intermediate' ? yearsAgo(30) : yearsAgo(18)}
                  max={addon.category === 'intermediate' ? yearsAgo(19) : yearsAgo(12)}
                />
              </div>
              <button
                type="button"
                onClick={() => removeAddon(i)}
                style={{ padding: '9px 10px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, cursor: 'pointer', color: T.error, marginBottom: 0, flexShrink: 0 }}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {canAddIntermediate && (
              <button
                type="button"
                onClick={() => addAddon('intermediate')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.teal, background: 'transparent', border: `1px dashed ${T.teal}`, borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}
              >
                <Plus size={14} /> Add Intermediate Member (19–30)
              </button>
            )}
            {canAddJunior && (
              <button
                type="button"
                onClick={() => addAddon('junior')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.teal, background: 'transparent', border: `1px dashed ${T.teal}`, borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}
              >
                <Plus size={14} /> Add Junior Member (12–18)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fee summary */}
      {fees && selected && (
        <div style={{ ...card, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 12 }}>
            Fee Estimate — {CATEGORY_FEES[selected].label}
            {addons.filter(a => a.name.trim()).length > 0 && ` + ${addons.filter(a => a.name.trim()).length} add-on${addons.filter(a => a.name.trim()).length > 1 ? 's' : ''}`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fees.joining_fee_cents > 0 && (
              <FeeRow label="Once-off joining fee" value={formatZAR(fees.joining_fee_cents)} />
            )}
            {fees.land_levy_cents > 0 && (
              <FeeRow label={`Levy — ${formatZAR(fees.land_levy_cents)}/yr (first 5 years)`} value="" />
            )}
            <FeeRow
              label={`Pro-rata subscription (${fees.months_remaining} of 12 months)`}
              value={formatZAR(fees.pro_rata_subs_cents)}
            />
            {fees.addon_breakdown.map((item, i) => (
              <FeeRow key={i} label={item.label} value={formatZAR(item.cents)} muted />
            ))}
            <div style={{ height: 1, background: '#BBF7D0', margin: '4px 0' }} />
            <FeeRow
              label={`Total due${fees.land_levy_cents > 0 ? ' (excl. levy)' : ''}`}
              value={formatZAR(fees.total_cents)}
              bold
            />
          </div>
          {fees.land_levy_cents > 0 && (
            <p style={{ fontSize: 11, color: '#166534', marginTop: 10, lineHeight: 1.5 }}>
              * Levy of {formatZAR(fees.land_levy_cents)}/year is payable for the first 5 years of membership.
              This is billed annually and is not included in the pro-rata total above.
            </p>
          )}
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFFFFF', borderRadius: 6, border: '1px solid #BBF7D0' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 4 }}>Banking details</div>
            <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
              Account Name: Vaal Cruising Association<br />
              Bank: FNB · Account: 63004352603 · Branch: 255355<br />
              Reference: Your full name<br />
              Send proof to: <strong>vaalcruisingfinance@gmail.com</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Personal Details ─────────────────────────────────────────────────

interface PersonalData {
  surname: string;
  first_names: string;
  id_number: string;
  date_of_birth: string;
  postal_address: string;
  postal_code: string;
  home_address: string;
  home_code: string;
  contact_mobile: string;
  contact_work: string;
  contact_home: string;
  email: string;
  emergency_contact_name: string;
  emergency_contact_number: string;
  occupation: string;
  employer: string;
  business_type: string;
  other_clubs: string;
}

function StepPersonal({ data, onChange }: { data: PersonalData; onChange: (d: PersonalData) => void }) {
  const set = (field: keyof PersonalData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...data, [field]: e.target.value });

  const setPhone = (field: 'contact_mobile' | 'contact_work' | 'contact_home' | 'emergency_contact_number') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...data, [field]: sanitizePhone(e.target.value) });

  const setIdNumber = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...data, id_number: e.target.value.replace(/\D/g, '').slice(0, 13) });

  const today = todayStr();

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.navy, marginBottom: 4 }}>Personal Details</h2>
      <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 24 }}>Your contact and personal information.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 16px' }}>
        <Field label="Surname" required><FieldInput value={data.surname} onChange={set('surname')} /></Field>
        <Field label="First names" required><FieldInput value={data.first_names} onChange={set('first_names')} /></Field>
        <Field label="ID number (13 digits)">
          <FieldInput
            value={data.id_number}
            onChange={setIdNumber}
            inputMode="numeric"
            maxLength={13}
            placeholder="e.g. 8001015009087"
          />
        </Field>
        <Field label="Date of birth">
          <FieldInput
            type="date"
            value={data.date_of_birth}
            onChange={set('date_of_birth')}
            min="1900-01-01"
            max={today}
          />
        </Field>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, margin: '8px 0 14px' }}>Postal address</div>
      <Field label="Address"><FieldInput value={data.postal_address} onChange={set('postal_address')} /></Field>
      <Field label="Postal code"><FieldInput value={data.postal_code} onChange={set('postal_code')} style={{ maxWidth: 120 }} /></Field>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, margin: '8px 0 14px' }}>Home address</div>
      <Field label="Address"><FieldInput value={data.home_address} onChange={set('home_address')} /></Field>
      <Field label="Postal code"><FieldInput value={data.home_code} onChange={set('home_code')} style={{ maxWidth: 120 }} /></Field>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, margin: '8px 0 14px' }}>Contact numbers</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 16px' }}>
        <Field label="Mobile" required>
          <FieldInput
            type="tel"
            inputMode="numeric"
            value={data.contact_mobile}
            onChange={setPhone('contact_mobile')}
            placeholder="+27 82 123 4567"
          />
        </Field>
        <Field label="Work">
          <FieldInput
            type="tel"
            inputMode="numeric"
            value={data.contact_work}
            onChange={setPhone('contact_work')}
            placeholder="+27 11 123 4567"
          />
        </Field>
        <Field label="Home">
          <FieldInput
            type="tel"
            inputMode="numeric"
            value={data.contact_home}
            onChange={setPhone('contact_home')}
            placeholder="+27 16 123 4567"
          />
        </Field>
      </div>

      <Field label="Email address" required>
        <FieldInput
          type="email"
          inputMode="email"
          value={data.email}
          onChange={set('email')}
          placeholder="you@example.com"
        />
      </Field>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, margin: '8px 0 4px' }}>Emergency contact</div>
      <p style={{ fontSize: 12, color: T.textMuted, margin: '0 0 14px' }}>Must be someone other than your partner or spouse.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 16px' }}>
        <Field label="Name" required>
          <FieldInput value={data.emergency_contact_name} onChange={set('emergency_contact_name')} placeholder="Full name" />
        </Field>
        <Field label="Contact number" required>
          <FieldInput
            type="tel"
            inputMode="numeric"
            value={data.emergency_contact_number}
            onChange={setPhone('emergency_contact_number')}
            placeholder="+27 82 123 4567"
          />
        </Field>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, margin: '8px 0 14px' }}>Occupation</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 16px' }}>
        <Field label="Occupation"><FieldInput value={data.occupation} onChange={set('occupation')} /></Field>
        <Field label="Employer"><FieldInput value={data.employer} onChange={set('employer')} /></Field>
        <Field label="Type of business"><FieldInput value={data.business_type} onChange={set('business_type')} /></Field>
      </div>

      <Field label="Other clubs (name and activities)">
        <FieldInput value={data.other_clubs} onChange={set('other_clubs')} />
      </Field>
    </div>
  );
}

// ─── Step 3: Family & Boats ───────────────────────────────────────────────────

interface Child {
  name: string;
  dob: string;
}

interface Boat {
  type: string;
  name: string;
  reg_no: string;
  ownership: string;
}

interface FamilyData {
  partner_name: string;
  partner_dob: string;
  children: Child[];
  boating_experience: string;
  boats: Boat[];
}

function StepFamily({
  data,
  onChange,
  category,
}: {
  data: FamilyData;
  onChange: (d: FamilyData) => void;
  category: MembershipCategory;
}) {
  const showPartner = ['ordinary', 'social'].includes(category);

  const setPartner = (field: 'partner_name' | 'partner_dob') => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...data, [field]: e.target.value });

  const setChild = (i: number, field: keyof Child) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const children = [...data.children];
    children[i] = { ...children[i], [field]: e.target.value };
    onChange({ ...data, children });
  };

  const addChild = () => onChange({ ...data, children: [...data.children, { name: '', dob: '' }] });
  const removeChild = (i: number) => onChange({ ...data, children: data.children.filter((_, idx) => idx !== i) });

  const setBoat = (i: number, field: keyof Boat) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const boats = [...data.boats];
    boats[i] = { ...boats[i], [field]: e.target.value };
    onChange({ ...data, boats });
  };

  const addBoat = () => {
    if (data.boats.length < 2) onChange({ ...data, boats: [...data.boats, { type: '', name: '', reg_no: '', ownership: 'Owner' }] });
  };

  const removeBoat = (i: number) => onChange({ ...data, boats: data.boats.filter((_, idx) => idx !== i) });

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.navy, marginBottom: 4 }}>Family & Vessels</h2>
      <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 24 }}>Partner, children under 12, and boats you own or co-own.</p>

      {showPartner && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, marginBottom: 14 }}>Partner</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 16px' }}>
            <Field label="Partner's name"><FieldInput value={data.partner_name} onChange={setPartner('partner_name')} /></Field>
            <Field label="Date of birth">
              <FieldInput type="date" value={data.partner_dob} onChange={setPartner('partner_dob')} min="1900-01-01" max={todayStr()} />
            </Field>
          </div>
        </>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, margin: '8px 0 6px' }}>Children under 12</div>
      <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>Children under 12 are included in your membership at no extra cost.</p>
      {data.children.map((child, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Label>Name</Label>
            <FieldInput value={child.name} onChange={setChild(i, 'name')} placeholder="Full name" />
          </div>
          <div style={{ width: 140 }}>
            <Label>Date of birth</Label>
            <FieldInput type="date" value={child.dob} onChange={setChild(i, 'dob')} min={yearsAgo(12)} max={todayStr()} />
          </div>
          <button type="button" onClick={() => removeChild(i)} style={{ padding: '9px 10px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, cursor: 'pointer', color: T.error }}>
            <X size={14} />
          </button>
        </div>
      ))}
      {data.children.length < 8 && (
        <button type="button" onClick={addChild} style={{ fontSize: 13, color: T.teal, background: 'transparent', border: `1px dashed ${T.teal}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', marginBottom: 20 }}>
          + Add child (under 12)
        </button>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, margin: '16px 0 8px' }}>Yachting, boating & club admin experience</div>
      <Field label="">
        <FieldTextarea value={data.boating_experience} onChange={(e) => onChange({ ...data, boating_experience: e.target.value })} placeholder="Describe your boating experience and any club roles held…" />
      </Field>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, margin: '8px 0 14px' }}>Craft owned</div>
      {data.boats.map((boat, i) => (
        <div key={i} style={{ ...card, marginBottom: 12, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary }}>Vessel {i + 1}</span>
            <button type="button" onClick={() => removeBoat(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.error, padding: 0 }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0 12px' }}>
            <Field label="Type"><FieldInput value={boat.type} onChange={setBoat(i, 'type')} placeholder="e.g. Sailing yacht" /></Field>
            <Field label="Name"><FieldInput value={boat.name} onChange={setBoat(i, 'name')} placeholder="Vessel name" /></Field>
            <Field label="Reg no."><FieldInput value={boat.reg_no} onChange={setBoat(i, 'reg_no')} /></Field>
            <Field label="Ownership">
              <select
                value={boat.ownership}
                onChange={(e) => { const boats = [...data.boats]; boats[i] = { ...boats[i], ownership: e.target.value }; onChange({ ...data, boats }); }}
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 14, background: '#FFFFFF', color: T.textPrimary }}
              >
                <option>Owner</option>
                <option>Part Owner</option>
              </select>
            </Field>
          </div>
        </div>
      ))}
      {data.boats.length < 2 && (
        <button type="button" onClick={addBoat} style={{ fontSize: 13, color: T.teal, background: 'transparent', border: `1px dashed ${T.teal}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
          + Add vessel
        </button>
      )}
    </div>
  );
}

// ─── Step 4: Photo & Declaration ─────────────────────────────────────────────

function StepPhoto({
  photoFile,
  photoPreview,
  onPhotoChange,
  agreed,
  onAgreeChange,
  venueId,
}: {
  photoFile: File | null;
  photoPreview: string | null;
  onPhotoChange: (file: File | null, preview: string | null) => void;
  agreed: boolean;
  onAgreeChange: (v: boolean) => void;
  venueId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  void venueId;

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => onPhotoChange(file, e.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.navy, marginBottom: 4 }}>Photo & Declaration</h2>
      <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 24 }}>
        A photo of the applicant (and partner/family if applicable) is required. JPG or PNG, max 5 MB.
      </p>

      <div style={{ marginBottom: 24 }}>
        <Label required>Photo</Label>
        {photoPreview ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <img src={photoPreview} alt="Preview" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}` }} />
            <div>
              <p style={{ fontSize: 13, color: T.textSecondary, marginBottom: 8 }}>{photoFile?.name}</p>
              <button
                type="button"
                onClick={() => onPhotoChange(null, null)}
                style={{ fontSize: 13, color: T.error, background: 'transparent', border: `1px solid ${T.error}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleFile(file); }}
            style={{
              border: `2px dashed ${T.border}`,
              borderRadius: 8,
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: '#FAFBFC',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = T.teal)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = T.border)}
          >
            <Upload size={28} color={T.textMuted} style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: 14, color: T.textSecondary, margin: '0 0 4px' }}>Click or drag to upload photo</p>
            <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>JPG, PNG, WEBP — max 5 MB</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      <div style={{ ...card, background: '#F8FAFC', marginBottom: 20 }}>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: T.textSecondary, margin: 0 }}>
          I hereby agree, on acceptance of my membership to the Vaal Cruising Association, to abide by the
          Constitution and Rules of the Association. This includes the Social Media Policy as well as the
          WhatsApp Rules. I acknowledge that VCA abides by the POPI Act as prescribed.
        </p>
      </div>
      <label style={{ display: 'flex', gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onAgreeChange(e.target.checked)}
          style={{ marginTop: 2, width: 16, height: 16, accentColor: T.teal, flexShrink: 0 }}
        />
        <span style={{ fontSize: 14, color: T.textPrimary, lineHeight: 1.5 }}>
          I have read and agree to the above declaration
        </span>
      </label>
    </div>
  );
}

// ─── Confirmation screen ──────────────────────────────────────────────────────

function Confirmation({ name }: { name: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Check size={32} color="#059669" />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: T.navy, marginBottom: 8 }}>Application submitted!</h2>
      <p style={{ fontSize: 15, color: T.textSecondary, marginBottom: 24, maxWidth: 420, margin: '0 auto 24px' }}>
        Thank you, {name}. Your application has been received. The VCA committee will be in touch after reviewing your application.
      </p>
      <div style={{ ...card, textAlign: 'left', maxWidth: 400, margin: '0 auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, marginBottom: 10 }}>Next steps</div>
        {[
          'The committee will contact you to arrange a meeting.',
          'Once accepted, you will receive your fee schedule and banking details by email.',
          'Fees are due in full on notification of probationary acceptance.',
          'Final review is carried out after a minimum 8-week probationary period.',
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: T.teal, color: '#FFF', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
            <span style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.5 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STEPS = ['Category', 'Personal details', 'Family & vessels', 'Photo & declaration'];

export default function MembershipApplicationPage() {
  const { venueId, venue } = useVenue();
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [category, setCategory] = useState<MembershipCategory | null>(null);
  const [addons, setAddons] = useState<AddOnMember[]>([]);
  const [personal, setPersonal] = useState<PersonalData>({
    surname: '', first_names: '', id_number: '', date_of_birth: '',
    postal_address: '', postal_code: '', home_address: '', home_code: '',
    contact_mobile: '', contact_work: '', contact_home: '', email: '',
    emergency_contact_name: '', emergency_contact_number: '',
    occupation: '', employer: '', business_type: '', other_clubs: '',
  });
  const [family, setFamily] = useState<FamilyData>({
    partner_name: '', partner_dob: '', children: [], boating_experience: '', boats: [],
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const validateStep = (): string => {
    if (step === 0 && !category) return 'Please select a membership category.';
    if (step === 0 && category === 'ordinary') {
      const unnamed = addons.some((a) => !a.name.trim());
      if (unnamed) return 'Please enter a name for each add-on family member, or remove them.';
    }
    if (step === 1) {
      if (!personal.surname.trim()) return 'Surname is required.';
      if (!personal.first_names.trim()) return 'First names are required.';
      if (!personal.contact_mobile.trim()) return 'Mobile number is required.';
      if (!isValidPhone(personal.contact_mobile)) return 'Mobile must be a valid South African number starting with +27 or 0 (e.g. +27821234567).';
      if (!personal.email.trim()) return 'Email address is required.';
      if (!isValidEmail(personal.email)) return 'Please enter a valid email address.';
      if (!personal.emergency_contact_name.trim()) return 'Emergency contact name is required.';
      if (!personal.emergency_contact_number.trim()) return 'Emergency contact number is required.';
      if (!isValidPhone(personal.emergency_contact_number)) return 'Emergency contact number must be a valid South African number starting with +27 or 0.';
    }
    if (step === 3) {
      if (!photoFile) return 'A photo is required.';
      if (!agreed) return 'Please agree to the declaration to continue.';
    }
    return '';
  };

  const next = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setStep((s) => s + 1);
  };

  const back = () => { setError(''); setStep((s) => s - 1); };

  const handleSubmit = async () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setSubmitting(true);

    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() ?? 'jpg';
        const path = `${venueId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('application-photos')
          .upload(path, photoFile, { upsert: false });
        if (uploadErr) throw new Error('Photo upload failed: ' + uploadErr.message);
        photoUrl = path;
      }

      const namedAddons = addons.filter((a) => a.name.trim());
      const fees = category ? calculateFees(category, namedAddons) : null;

      const { error: fnErr } = await supabase.functions.invoke('submit-membership-application', {
        body: {
          venue_id: venueId,
          membership_category: category,
          calculated_fees: fees
            ? {
                joining_fee_cents: fees.joining_fee_cents,
                land_levy_cents: fees.land_levy_cents,
                pro_rata_subs_cents: fees.pro_rata_subs_cents,
                months_remaining: fees.months_remaining,
                addon_fees_cents: fees.addon_fees_cents,
                addon_breakdown: fees.addon_breakdown,
                total_cents: fees.total_cents,
              }
            : null,
          ...personal,
          partner_name: family.partner_name || null,
          partner_dob: family.partner_dob || null,
          children: family.children.filter((c) => c.name.trim()).length > 0 ? family.children.filter((c) => c.name.trim()) : null,
          addon_members: namedAddons.length > 0 ? namedAddons : null,
          boating_experience: family.boating_experience || null,
          boats: family.boats.filter((b) => b.name.trim()).length > 0 ? family.boats.filter((b) => b.name.trim()) : null,
          photo_url: photoUrl,
        },
      });

      if (fnErr) throw new Error(fnErr.message);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const venueName = (venue as { name?: string } | null)?.name ?? 'Vaal Cruising Association';

  return (
    <div style={{ minHeight: '100vh', background: T.offWhite }}>
      {/* Header */}
      <div style={{ background: T.navy, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Anchor size={24} color={T.gold} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>{venueName}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Membership Application</div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 40px' }}>
        {submitted ? (
          <div style={card}>
            <Confirmation name={personal.first_names} />
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
              {STEPS.map((label, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: i < step ? T.teal : i === step ? T.navy : '#E2E8F0',
                    color: i <= step ? '#FFF' : T.textMuted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, marginBottom: 4,
                  }}>
                    {i < step ? <Check size={12} /> : i + 1}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>

            {/* Step content */}
            <div style={card}>
              {step === 0 && (
                <StepCategory
                  selected={category}
                  onSelect={(c) => { setCategory(c); if (c !== 'ordinary') setAddons([]); }}
                  addons={addons}
                  onAddonsChange={setAddons}
                />
              )}
              {step === 1 && <StepPersonal data={personal} onChange={setPersonal} />}
              {step === 2 && <StepFamily data={family} onChange={setFamily} category={category!} />}
              {step === 3 && (
                <StepPhoto
                  photoFile={photoFile}
                  photoPreview={photoPreview}
                  onPhotoChange={(f, p) => { setPhotoFile(f); setPhotoPreview(p); }}
                  agreed={agreed}
                  onAgreeChange={setAgreed}
                  venueId={venueId}
                />
              )}

              {error && (
                <div style={{ marginTop: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 13, color: T.error }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, gap: 12 }}>
                {step > 0 ? (
                  <button type="button" onClick={back} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 14, fontWeight: 600, color: T.textSecondary, cursor: 'pointer' }}>
                    <ChevronLeft size={16} /> Back
                  </button>
                ) : <div />}

                {step < STEPS.length - 1 ? (
                  <button type="button" onClick={next} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px', background: T.teal, border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer' }}>
                    Continue <ChevronRight size={16} />
                  </button>
                ) : (
                  <button type="button" onClick={handleSubmit} disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: submitting ? T.textMuted : T.navy, border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, color: '#FFFFFF', cursor: submitting ? 'not-allowed' : 'pointer' }}>
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    {submitting ? 'Submitting…' : 'Submit application'}
                  </button>
                )}
              </div>
            </div>

            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: T.textMuted }}>
              Prefer a paper form?{' '}
              <a href="/VCA_Application_Form_2026_2027.pdf" target="_blank" rel="noopener noreferrer" style={{ color: T.teal, textDecoration: 'underline' }}>
                Download the PDF application
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
