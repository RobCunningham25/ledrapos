import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface SiteRow { id: string; site_number: string }
interface ShedRow { id: string; shed_number: string }
interface BoatRow { id: string; boat_name: string; registration_number: string | null }

interface Props {
  memberId: string;
  venueId: string;
  onMemberUpdated: () => void;
}

export default function MemberDetailsTab({ memberId, venueId, onMemberUpdated }: Props) {
  const [personal, setPersonal] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    emergency_contact_name: '', emergency_contact_phone: '',
  });
  const [savingPersonal, setSavingPersonal] = useState(false);

  const [partner, setPartner] = useState({
    partner_first_name: '', partner_last_name: '', partner_email: '', partner_phone: '',
  });
  const [savingPartner, setSavingPartner] = useState(false);

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [newSite, setNewSite] = useState('');
  const [sheds, setSheds] = useState<ShedRow[]>([]);
  const [newShed, setNewShed] = useState('');
  const [boats, setBoats] = useState<BoatRow[]>([]);
  const [newBoatName, setNewBoatName] = useState('');
  const [newBoatReg, setNewBoatReg] = useState('');

  const fetchMemberData = useCallback(async () => {
    const { data } = await supabase
      .from('members')
      .select('first_name, last_name, email, phone, emergency_contact_name, emergency_contact_phone, partner_first_name, partner_last_name, partner_email, partner_phone')
      .eq('id', memberId).eq('venue_id', venueId).single();
    if (data) {
      setPersonal({
        first_name: data.first_name || '', last_name: data.last_name || '',
        email: data.email || '', phone: data.phone || '',
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_phone: data.emergency_contact_phone || '',
      });
      setPartner({
        partner_first_name: data.partner_first_name || '', partner_last_name: data.partner_last_name || '',
        partner_email: data.partner_email || '', partner_phone: data.partner_phone || '',
      });
    }
  }, [memberId, venueId]);

  const fetchSites = useCallback(async () => {
    const { data } = await supabase.from('member_sites').select('id, site_number').eq('member_id', memberId).eq('venue_id', venueId).order('created_at');
    setSites((data as SiteRow[]) || []);
  }, [memberId, venueId]);

  const fetchSheds = useCallback(async () => {
    const { data } = await supabase.from('member_boat_sheds').select('id, shed_number').eq('member_id', memberId).eq('venue_id', venueId).order('created_at');
    setSheds((data as ShedRow[]) || []);
  }, [memberId, venueId]);

  const fetchBoats = useCallback(async () => {
    const { data } = await supabase.from('member_boats').select('id, boat_name, registration_number').eq('member_id', memberId).eq('venue_id', venueId).order('created_at');
    setBoats((data as BoatRow[]) || []);
  }, [memberId, venueId]);

  useEffect(() => { fetchMemberData(); fetchSites(); fetchSheds(); fetchBoats(); }, [fetchMemberData, fetchSites, fetchSheds, fetchBoats]);

  const savePersonal = async () => {
    if (!personal.first_name.trim() || !personal.last_name.trim()) { toast.error('First and last name are required'); return; }
    setSavingPersonal(true);
    const { error } = await supabase.from('members').update({
      first_name: personal.first_name.trim(), last_name: personal.last_name.trim(),
      email: personal.email.trim() || null, phone: personal.phone.trim() || null,
      emergency_contact_name: personal.emergency_contact_name.trim() || null,
      emergency_contact_phone: personal.emergency_contact_phone.trim() || null,
    }).eq('id', memberId).eq('venue_id', venueId);
    setSavingPersonal(false);
    if (error) toast.error('Failed to save');
    else { toast.success('Personal details updated'); onMemberUpdated(); }
  };

  const savePartner = async () => {
    setSavingPartner(true);
    const { error } = await supabase.from('members').update({
      partner_first_name: partner.partner_first_name.trim() || null,
      partner_last_name: partner.partner_last_name.trim() || null,
      partner_email: partner.partner_email.trim() || null,
      partner_phone: partner.partner_phone.trim() || null,
    }).eq('id', memberId).eq('venue_id', venueId);
    setSavingPartner(false);
    if (error) toast.error('Failed to save');
    else { toast.success('Partner details updated'); onMemberUpdated(); }
  };

  const addSite = async () => {
    if (!newSite.trim()) return;
    await supabase.from('member_sites').insert({ venue_id: venueId, member_id: memberId, site_number: newSite.trim() });
    setNewSite(''); fetchSites(); toast.success('Site added');
  };
  const removeSite = async (id: string) => { await supabase.from('member_sites').delete().eq('id', id); fetchSites(); };

  const addShed = async () => {
    if (!newShed.trim()) return;
    await supabase.from('member_boat_sheds').insert({ venue_id: venueId, member_id: memberId, shed_number: newShed.trim() });
    setNewShed(''); fetchSheds(); toast.success('Shed added');
  };
  const removeShed = async (id: string) => { await supabase.from('member_boat_sheds').delete().eq('id', id); fetchSheds(); };

  const addBoat = async () => {
    if (!newBoatName.trim()) return;
    await supabase.from('member_boats').insert({ venue_id: venueId, member_id: memberId, boat_name: newBoatName.trim(), registration_number: newBoatReg.trim() || null });
    setNewBoatName(''); setNewBoatReg(''); fetchBoats(); toast.success('Boat added');
  };
  const removeBoat = async (id: string) => { await supabase.from('member_boats').delete().eq('id', id); fetchBoats(); };

  const inputStyle = { height: 44, borderRadius: 6, fontSize: 14 };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#718096', marginBottom: 4, display: 'block' };
  const cardStyle: React.CSSProperties = { background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 20, marginBottom: 16 };
  const sectionHeading: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#1A202C', marginBottom: 16 };

  return (
    <div>
      {/* Personal Details */}
      <div style={cardStyle}>
        <h3 style={sectionHeading}>Personal Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label style={labelStyle}>First Name *</label><Input value={personal.first_name} onChange={e => setPersonal(p => ({ ...p, first_name: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Last Name *</label><Input value={personal.last_name} onChange={e => setPersonal(p => ({ ...p, last_name: e.target.value }))} style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>Email</label>
            <Input type="email" value={personal.email} onChange={e => setPersonal(p => ({ ...p, email: e.target.value }))} style={inputStyle} />
            <p style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>Changing email here updates contact details. Login email remains unchanged.</p>
          </div>
          <div><label style={labelStyle}>Phone</label><Input value={personal.phone} onChange={e => setPersonal(p => ({ ...p, phone: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Emergency Contact Name</label><Input value={personal.emergency_contact_name} onChange={e => setPersonal(p => ({ ...p, emergency_contact_name: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Emergency Contact Phone</label><Input value={personal.emergency_contact_phone} onChange={e => setPersonal(p => ({ ...p, emergency_contact_phone: e.target.value }))} style={inputStyle} /></div>
        </div>
        <Button onClick={savePersonal} disabled={savingPersonal} className="mt-4" style={{ height: 44, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6, paddingLeft: 24, paddingRight: 24 }}>
          {savingPersonal && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save Personal Details
        </Button>
      </div>

      {/* Partner Details */}
      <div style={cardStyle}>
        <h3 style={sectionHeading}>Partner Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label style={labelStyle}>Partner First Name</label><Input value={partner.partner_first_name} onChange={e => setPartner(p => ({ ...p, partner_first_name: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Partner Last Name</label><Input value={partner.partner_last_name} onChange={e => setPartner(p => ({ ...p, partner_last_name: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Partner Email</label><Input type="email" value={partner.partner_email} onChange={e => setPartner(p => ({ ...p, partner_email: e.target.value }))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Partner Cellphone</label><Input value={partner.partner_phone} onChange={e => setPartner(p => ({ ...p, partner_phone: e.target.value }))} style={inputStyle} /></div>
        </div>
        <Button onClick={savePartner} disabled={savingPartner} className="mt-4" style={{ height: 44, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600, borderRadius: 6, paddingLeft: 24, paddingRight: 24 }}>
          {savingPartner && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save Partner Details
        </Button>
      </div>

      {/* Site Numbers */}
      <div style={cardStyle}>
        <h3 style={sectionHeading}>Site Numbers</h3>
        {sites.length === 0 && <p style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>No sites added</p>}
        <div className="flex flex-wrap gap-2 mb-3">
          {sites.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1" style={{ fontSize: 14, color: '#1A202C', background: '#F4F6F9', border: '1px solid #E2E8F0', borderRadius: 16, padding: '6px 14px' }}>
              {s.site_number}
              <button onClick={() => removeSite(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#C0392B')} onMouseLeave={e => (e.currentTarget.style.color = '#718096')}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Site number" value={newSite} onChange={e => setNewSite(e.target.value)} style={{ ...inputStyle, width: 160 }} onKeyDown={e => e.key === 'Enter' && addSite()} />
          <Button onClick={addSite} style={{ height: 36, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 500, borderRadius: 6, paddingLeft: 14, paddingRight: 14 }}>Add</Button>
        </div>
      </div>

      {/* Boat Shed Numbers */}
      <div style={cardStyle}>
        <h3 style={sectionHeading}>Boat Shed Numbers</h3>
        {sheds.length === 0 && <p style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>No sheds added</p>}
        <div className="flex flex-wrap gap-2 mb-3">
          {sheds.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1" style={{ fontSize: 14, color: '#1A202C', background: '#F4F6F9', border: '1px solid #E2E8F0', borderRadius: 16, padding: '6px 14px' }}>
              {s.shed_number}
              <button onClick={() => removeShed(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#C0392B')} onMouseLeave={e => (e.currentTarget.style.color = '#718096')}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Shed number" value={newShed} onChange={e => setNewShed(e.target.value)} style={{ ...inputStyle, width: 160 }} onKeyDown={e => e.key === 'Enter' && addShed()} />
          <Button onClick={addShed} style={{ height: 36, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 500, borderRadius: 6, paddingLeft: 14, paddingRight: 14 }}>Add</Button>
        </div>
      </div>

      {/* Boats */}
      <div style={cardStyle}>
        <h3 style={sectionHeading}>Boats</h3>
        {boats.length === 0 && <p style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>No boats added</p>}
        <div className="space-y-2 mb-3">
          {boats.map(b => (
            <div key={b.id} className="relative" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, padding: 12 }}>
              <p style={{ fontWeight: 500, color: '#1A202C' }}>{b.boat_name}</p>
              <p style={{ fontSize: 13, color: '#718096' }}>{b.registration_number || 'No registration'}</p>
              <button onClick={() => removeBoat(b.id)} className="absolute top-3 right-3" style={{ fontSize: 13, color: '#C0392B', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
            </div>
          ))}
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <Input placeholder="Boat name" value={newBoatName} onChange={e => setNewBoatName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <Input placeholder="Registration number" value={newBoatReg} onChange={e => setNewBoatReg(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <Button onClick={addBoat} style={{ height: 36, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 500, borderRadius: 6, paddingLeft: 14, paddingRight: 14, flexShrink: 0 }}>Add</Button>
        </div>
      </div>
    </div>
  );
}
