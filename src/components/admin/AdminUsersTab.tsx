import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, UserX, UserCheck } from 'lucide-react';

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

export default function AdminUsersTab() {
  const { venueId } = useVenue();
  const { session } = useAdminAuth();
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);

  // Deactivate confirm
  const [confirmTarget, setConfirmTarget] = useState<AdminUserRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'reactivate'>('deactivate');

  const loadAdmins = useCallback(async () => {
    const { data } = await supabase
      .from('admin_users')
      .select('id, name, email, role, is_active, created_at')
      .eq('venue_id', venueId)
      .order('is_active', { ascending: false })
      .order('role', { ascending: true })
      .order('name', { ascending: true });
    if (data) setAdmins(data);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  const handleInvite = async () => {
    setInviteError('');
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError('Name and email are required');
      return;
    }

    // Check duplicate locally
    if (admins.some(a => a.email.toLowerCase() === inviteEmail.trim().toLowerCase())) {
      setInviteError('An admin with this email already exists for this venue');
      return;
    }

    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-admin', {
        body: { email: inviteEmail.trim(), name: inviteName.trim(), role: 'admin', venue_id: venueId },
      });

      if (error) {
        setInviteError(error.message || 'Failed to send invite');
        setInviting(false);
        return;
      }

      if (data?.error) {
        setInviteError(data.error);
        setInviting(false);
        return;
      }

      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setShowInvite(false);
      setInviteName('');
      setInviteEmail('');
      loadAdmins();
    } catch {
      setInviteError('Failed to send invite');
    }
    setInviting(false);
  };

  const handleToggleActive = async () => {
    if (!confirmTarget) return;
    const newActive = confirmAction === 'reactivate';
    const { error } = await supabase
      .from('admin_users')
      .update({ is_active: newActive })
      .eq('id', confirmTarget.id);

    if (error) {
      toast.error('Failed to update admin status');
    } else {
      toast.success(newActive ? `${confirmTarget.name} reactivated` : `${confirmTarget.name} deactivated`);
      loadAdmins();
    }
    setConfirmTarget(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#2E5FA3', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const activeAdmins = admins.filter(a => a.is_active);
  const deactivatedAdmins = admins.filter(a => !a.is_active);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: '#1A202C' }}>Admin Users</h3>
        <Button
          onClick={() => { setShowInvite(true); setInviteError(''); }}
          className="h-10 px-4 rounded-[8px] font-semibold text-sm"
          style={{ background: '#2E5FA3', color: '#fff' }}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Invite Admin
        </Button>
      </div>

      {/* Active admins */}
      <div className="space-y-2">
        {activeAdmins.map(admin => (
          <div
            key={admin.id}
            className="flex items-center justify-between p-4 bg-white rounded-[8px] border"
            style={{ borderColor: '#E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: '#1A202C' }}>{admin.name}</p>
                <p className="text-xs" style={{ color: '#718096' }}>{admin.email}</p>
              </div>
              <Badge
                className="ml-2 text-[11px] border-0"
                style={{
                  background: admin.role === 'superadmin' ? '#1A202C' : '#2E5FA3',
                  color: '#fff',
                }}
              >
                {admin.role}
              </Badge>
            </div>
            {admin.role !== 'superadmin' && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-medium h-8 px-3"
                style={{ color: '#DC2626' }}
                onClick={() => { setConfirmTarget(admin); setConfirmAction('deactivate'); }}
              >
                <UserX className="w-3.5 h-3.5 mr-1" /> Deactivate
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Deactivated admins */}
      {deactivatedAdmins.length > 0 && (
        <>
          <p className="text-xs font-medium pt-2" style={{ color: '#718096' }}>Deactivated</p>
          <div className="space-y-2">
            {deactivatedAdmins.map(admin => (
              <div
                key={admin.id}
                className="flex items-center justify-between p-4 rounded-[8px] border opacity-60"
                style={{ background: '#F7FAFC', borderColor: '#E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#EF4444' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#1A202C' }}>{admin.name}</p>
                    <p className="text-xs" style={{ color: '#718096' }}>{admin.email}</p>
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
                  onClick={() => { setConfirmTarget(admin); setConfirmAction('reactivate'); }}
                >
                  <UserCheck className="w-3.5 h-3.5 mr-1" /> Reactivate
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {admins.length === 0 && (
        <p className="text-sm text-center py-8" style={{ color: '#718096' }}>No admin users found.</p>
      )}

      {/* Invite Modal */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Admin</DialogTitle>
            <DialogDescription>Send an invite to a new venue admin. They'll receive an email to set their password.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>Name</label>
              <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Full name" className="h-11" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>Email</label>
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="admin@example.com" className="h-11" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#1A202C' }}>Role</label>
              <Input value="Admin" disabled className="h-11 bg-gray-50" />
              <p className="text-xs mt-1" style={{ color: '#718096' }}>Only admin role can be assigned through the UI.</p>
            </div>
            {inviteError && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{inviteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button
              onClick={handleInvite}
              disabled={inviting}
              style={{ background: '#2E5FA3', color: '#fff' }}
            >
              {inviting ? 'Sending…' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivate/Reactivate */}
      <Dialog open={!!confirmTarget} onOpenChange={() => setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmAction === 'deactivate' ? 'Deactivate Admin' : 'Reactivate Admin'}</DialogTitle>
            <DialogDescription>
              {confirmAction === 'deactivate'
                ? `Deactivate ${confirmTarget?.name}? They will no longer be able to access the admin panel.`
                : `Reactivate ${confirmTarget?.name}? They will regain access to the admin panel.`}
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
