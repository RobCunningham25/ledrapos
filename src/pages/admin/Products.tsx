import { useState, useMemo } from 'react';
import { Plus, Pencil, ToggleLeft, ToggleRight, Search } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import ProductDrawer from '@/components/admin/ProductDrawer';
import BarTabRemindersCard from '@/components/admin/BarTabRemindersCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { CATEGORIES, CATEGORY_COLORS, getCategoryLabel } from '@/constants/productCategories';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'liquor_products'>;

export default function Products() {
  const { products, isLoading, refetch } = useProducts();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.brand?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [products, categoryFilter, search, showInactive]);

  async function toggleActive(product: Product) {
    const { error } = await supabase
      .from('liquor_products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id);
    if (error) toast.error('Failed to update product');
    else refetch();
  }

  function openAdd() {
    setEditingProduct(null);
    setDrawerOpen(true);
  }

  function openEdit(product: Product) {
    setEditingProduct(product);
    setDrawerOpen(true);
  }

  return (
    <AdminLayout
      title="Products"
      action={
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      }
    >
      <div className="mb-6">
        <BarTabRemindersCard />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox
            checked={showInactive}
            onCheckedChange={(v) => setShowInactive(v === true)}
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Size</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Price</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                [1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-border">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <p className="font-medium">No products found</p>
                    <p className="text-xs mt-1">Try adjusting your filters or add a new product.</p>
                  </td>
                </tr>
              )}

              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{p.name}</p>
                    {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: CATEGORY_COLORS[p.category],
                        color: CATEGORY_COLORS[p.category],
                        backgroundColor: `${CATEGORY_COLORS[p.category]}10`,
                      }}
                    >
                      {getCategoryLabel(p.category)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.size ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCents(p.selling_price_cents)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium">{p.stock_level}</span>
                    {p.stock_level <= p.min_stock_level && (
                      <Badge variant="outline" className="ml-2 text-xs border-warning text-warning bg-warning/10">
                        Low Stock
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.is_active ? (
                      <Badge className="bg-success/10 text-success border-success hover:bg-success/20" variant="outline">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActive(p)}
                        title={p.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {p.is_active ? (
                          <ToggleRight className="h-4 w-4 text-success" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ProductDrawer
        open={drawerOpen}
        product={editingProduct}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => refetch()}
      />
    </AdminLayout>
  );
}
