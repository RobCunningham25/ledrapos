import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, UserX, UserCheck, KeyRound, Pencil, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';

interface POSUserRow {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

export default function POSUsersTab() {
  const { venueId } = useVenue();
  const [users, setUsers] = useState<POSUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<POSUserRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('bartender');
  const [formPin, setFormPin] = useState('');
  const [formPinConfirm, setFormPinConfirm] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Change PIN modal
  const [pinTarget, setPinTarget] = useState<POSUserRow | null>(null);
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [showNewPinConfirm, setShowNewPinConfirm] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  // Deactivate confirm
  const [confirmTarget, setConfirmTarget] = useState<POSUserRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'reactivate'>('deactivate');

  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from('pos_users')
      .select('id, name, role, is_active, created_at')
      .eq('venue_id', venueId)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true });
    if (data) setUsers(data);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openAddDrawer = () => {
    setEditingUser(null);
    setFormName('');
    setFormRole('bartender');
    setFormPin('');
    setFormPinConfirm('');
    setFormError('');
    setShowPin(false);
    setShowPinConfirm(false);
    setDrawerOpen(true);
  };

  const openEditDrawer = (user: POSUserRow) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormRole(user.role);
    setFormPin('');
    setFormPinConfirm('');
    setFormError('');
    setDrawerOpen(true);
  };

  const validatePin = (pin: string): string | null => {
    if (!/^\d{4,6}$/.test(pin)) return 'PIN must be 4–6 digits';
    return null;
  };

  const handleDrawerSubmit = async () => {
    setFormError('');
    if (!formName.trim()) { setFormError('Name is required'); return; }

    if (!editingUser) {
      // Add mode — PIN required
      const pinErr = validatePin(formPin);
      if (pinErr) { setFormError(pinErr); return; }
      if (formPin !== formPinConfirm) { setFormError('PINs do not match'); return; }
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        // Edit — update name and role only
        const { error } = await supabase
          .from('pos_users')
          .update({ name: formName.trim(), role: formRole })
          .eq('id', editingUser.id);
        if (error) { setFormError('Failed to update user'); setSubmitting(false); return; }
        toast.success(`POS user ${formName.trim()} updated`);
      } else {
        // Add — hash PIN then insert
        const { data: hashData, error: hashError } = await supabase.functions.invoke('hash-pin', {
          body: { pin: formPin },
        });
        if (hashError || !hashData?.hash) {
          setFormError('Failed to hash PIN');
          setSubmitting(false);
          return;
        }
        const { error } = await supabase
          .from('pos_users')
          .insert({
            venue_id: venueId,
            name: formName.trim(),
            role: formRole,
            pin_hash: hashData.hash,
            is_active: true,
          });
        if (error) { setFormError('Failed to create user: ' + error.message); setSubmitting(false); return; }
        toast.success(`POS user ${formName.trim()} created`);
      }
      setDrawerOpen(false);
      loadUsers();
    } catch {
      setFormError('An unexpected error occurred');
    }
    setSubmitting(false);
  };

  const handleChangePin = async () => {
    setPinError('');
    const pinErr = validatePin(newPin);
    if (pinErr) { setPinError(pinErr); return; }
    if (newPin !== newPinConfirm) { setPinError('PINs do not match'); return; }

    setPinSubmitting(true);
    try {
      const { data: hashData, error: hashError } = await supabase.functions.invoke('hash-pin', {
        body: { pin: newPin },
      });
      if (hashError || !hashData?.hash) { setPinError('Failed to hash PIN'); setPinSubmitting(false); return; }

      const { error } = await supabase
        .from('pos_users')
        .update({ pin_hash: hashData.hash })
        .eq('id', pinTarget!.id);
      if (error) { setPinError('Failed to update PIN'); setPinSubmitting(false); return; }

      toast.success(`PIN updated for ${pinTarget!.name}`);
      setPinTarget(null);
    } catch {
      setPinError('An unexpected error occurred');
    }
    setPinSubmitting(false);
  };

  const handleToggleActive = async () => {
    if (!confirmTarget) return;
    const newActive = confirmAction === 'reactivate';
    const { error } = await supabase
      .from('pos_users')
      .update({ is_active: newActive })
      .eq('id', confirmTarget.id);
    if (error) {
      toast.error('Failed to update user status');
    } else {
      toast.success(newActive ? `${confirmTarget.name} reactivated` : `${confirmTarget.name} deactivated`);
      loadUsers();
    }
    setConfirmTarget(null);
  };

  const openChangePinModal = (user: POSUserRow) => {
    setPinTarget(user);
    setNewPin('');
    setNewPinConfirm('');
    setPinError('');
    setShowNewPin(false);
    setShowNewPinConfirm(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#2E5FA3', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const activeUsers = users.filter(u => u.is_active);
  const deactivatedUsers = users.filter(u => !u.is_active);

  const roleLabel = (role: string) => role === 'admin' ? 'Till Admin' : 'Bartender';
  const roleBg = (role: string) => role === 'admin' ? '#1A202C' : '#2E5FA3';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: '#1A202C' }}>POS Users</h3>
        <Button
          onClick={openAddDrawer}
          className="h-10 px-4 rounded-[8px] font-semibold text-sm"
          style={{ background: '#2E5FA3', color: '#fff' }}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add POS User
        </Button>
      </div>

      {/* Active users */}
      <div className="space-y-2">
        {activeUsers.map(user => (
          <div
            key={user.id}
            className="flex items-center justify-between p-4 bg-white rounded-[8px] border"
            style={{ borderColor: '#E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
              <div>
                <p className="text-[15px] font-semibold" style={{ color: '#1A202C' }}>{user.name}</p>
                <p className="text-xs" style={{ color: '#718096' }}>
                  {user.created_at ? format(new Date(user.created_at), 'dd MMM yyyy') : '—'}
                </p>
              </div>
              <Badge
                className="ml-2 text-[11px] border-0"
                style={{ background: roleBg(user.role), color: '#fff' }}
              >
                {roleLabel(user.role)}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-medium h-8 px-3 rounded-[6px]"
                onClick={() => openChangePinModal(user)}
              >
                <KeyRound className="w-3.5 h-3.5 mr-1" /> Change PIN
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-medium h-8 px-3 rounded-[6px]"
                onClick={() => openEditDrawer(user)}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-medium h-8 px-3"
                style={{ color: '#DC2626' }}
                onClick={() => { setConfirmTarget(user); setConfirmAction('deactivate'); }}
              >
                <UserX className="w-3.5 h-3.5 mr-1" /> Deactivate
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Deactivated users */}
      {deactivatedUsers.length > 0 && (
        <>
          <p className="text-xs font-medium pt-2" style={{ color: '#718096' }}>Deactivated</p>
          <div className="space-y-2">
            {deactivatedUsers.map(user => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 rounded-[8px] border opacity-60"
                style={{ background: '#F7FAFC', borderColor: '#E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#EF4444' }} />
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: '#1A202C' }}>{user.name}</p>
                    <p className="text-xs" style={{ color: '#718096' }}>
                      {user.created_at ? format(new Date(user.created_at), 'dd MMM yyyy') : '—'}
                    </p>
                  </div>
                  <Badge variant="outline" className="ml-2 text-[11px]" style={{ color: '#EF4444', borderColor: '#FCA5A5' }}>
                    Deactivated
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs font-medium h-8 px-3"
                  style={{ color: '#16A34A' }}
                  onClick={() => { setConfirmTarget(user); setConfirmAction('reactivate'); }}
                >
                  <UserCheck className="w-3.5 h-3.5 mr-1" /> Reactivate
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {users.length === 0 && (
        <p className="text-sm text-center py-8" style={{ color: '#718096' }}>No POS users found.</p>
      )}

      {/* Add/Edit Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingUser ? 'Edit POS User' : 'Add POS User'}</SheetTitle>
            <SheetDescription>
              {editingUser ? 'Update the name and role for this POS user.' : 'Create a new POS user with a PIN for till access.'}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>Name</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Full name" className="h-11" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>Role</label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bartender">Bartender</SelectItem>
                  <SelectItem value="admin">Till Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PIN fields — only for new users */}
            {!editingUser && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>PIN (4–6 digits)</label>
                  <div className="relative">
                    <Input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      value={formPin}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setFormPin(v);
                      }}
                      placeholder="••••"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPin(!showPin)}
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>Confirm PIN</label>
                  <div className="relative">
                    <Input
                      type={showPinConfirm ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      value={formPinConfirm}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setFormPinConfirm(v);
                      }}
                      placeholder="••••"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPinConfirm(!showPinConfirm)}
                    >
                      {showPinConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {formError && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{formError}</p>}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} className="flex-1 h-11">Cancel</Button>
              <Button
                onClick={handleDrawerSubmit}
                disabled={submitting}
                className="flex-1 h-11"
                style={{ background: '#2E5FA3', color: '#fff' }}
              >
                {submitting ? 'Saving…' : editingUser ? 'Save Changes' : 'Create User'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Change PIN Modal */}
      <Dialog open={!!pinTarget} onOpenChange={() => setPinTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change PIN for {pinTarget?.name}</DialogTitle>
            <DialogDescription>Enter a new 4–6 digit PIN for this POS user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>New PIN</label>
              <div className="relative">
                <Input
                  type={showNewPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setNewPin(v);
                  }}
                  placeholder="••••"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowNewPin(!showNewPin)}
                >
                  {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>Confirm New PIN</label>
              <div className="relative">
                <Input
                  type={showNewPinConfirm ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={newPinConfirm}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setNewPinConfirm(v);
                  }}
                  placeholder="••••"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowNewPinConfirm(!showNewPinConfirm)}
                >
                  {showNewPinConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {pinError && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{pinError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinTarget(null)}>Cancel</Button>
            <Button
              onClick={handleChangePin}
              disabled={pinSubmitting}
              style={{ background: '#2E5FA3', color: '#fff' }}
            >
              {pinSubmitting ? 'Saving…' : 'Save PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivate/Reactivate */}
      <Dialog open={!!confirmTarget} onOpenChange={() => setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmAction === 'deactivate' ? 'Deactivate POS User' : 'Reactivate POS User'}</DialogTitle>
            <DialogDescription>
              {confirmAction === 'deactivate'
                ? `Deactivate ${confirmTarget?.name}? They will no longer be able to log into the POS till.`
                : `Reactivate ${confirmTarget?.name}? They will regain POS till access.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>Cancel</Button>
            <Button
              onClick={handleToggleActive}
              style={{
                background: confirmAction === 'deactivate' ? '#DC2626' : '#16A34A',
                color: '#fff',
              }}
            >
              {confirmAction === 'deactivate' ? 'Deactivate' : 'Reactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
