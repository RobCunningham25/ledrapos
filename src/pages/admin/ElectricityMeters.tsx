import { useState, useMemo } from 'react';
import { Plus, Pencil, Search } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import ElectricityMeterDrawer from '@/components/admin/ElectricityMeterDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useElectricityMeters, type ElectricityMeterWithMember } from '@/hooks/useElectricityMeters';

export default function ElectricityMeters() {
  const { meters, isLoading, refetch } = useElectricityMeters();
  const [search, setSearch] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<ElectricityMeterWithMember | null>(null);

  const filtered = useMemo(() => {
    return meters.filter((m) => {
      if (unassignedOnly && m.member_id) return false;
      if (search) {
        const q = search.toLowerCase();
        const memberName = m.member ? `${m.member.first_name} ${m.member.last_name}` : '';
        const haystack = [m.meter_number, m.unit_label, m.description, memberName, m.member?.membership_number]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [meters, search, unassignedOnly]);

  function openAdd() {
    setEditingMeter(null);
    setDrawerOpen(true);
  }

  function openEdit(meter: ElectricityMeterWithMember) {
    setEditingMeter(meter);
    setDrawerOpen(true);
  }

  const unassignedCount = meters.filter((m) => !m.member_id).length;

  return (
    <AdminLayout
      title="Electricity Meters"
      action={
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add Meter
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by meter, site, or member..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox
            checked={unassignedOnly}
            onCheckedChange={(v) => setUnassignedOnly(v === true)}
          />
          Unassigned only
        </label>

        {unassignedCount > 0 && (
          <Badge variant="outline" className="text-muted-foreground ml-auto">
            {unassignedCount} unassigned
          </Badge>
        )}
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Site</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Meter Number</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Notes</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                [1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-border">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    <p className="font-medium">No meters found</p>
                    <p className="text-xs mt-1">Try adjusting your filters or add a new meter.</p>
                  </td>
                </tr>
              )}

              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{m.unit_label ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{m.meter_number}</td>
                  <td className="px-4 py-3">
                    {m.member ? (
                      <div>
                        <p className="text-foreground">{m.member.first_name} {m.member.last_name}</p>
                        <p className="text-xs text-muted-foreground">{m.member.membership_number}</p>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Unassigned</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.description ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ElectricityMeterDrawer
        open={drawerOpen}
        meter={editingMeter}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => refetch()}
      />
    </AdminLayout>
  );
}
