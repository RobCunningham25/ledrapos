import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES } from '@/constants/productCategories';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'liquor_products'>;

interface ProductDrawerProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  name: string;
  brand: string;
  category: string;
  size: string;
  abv: string;
  sellingPrice: string;
  purchasePrice: string;
  stockLevel: string;
  minStockLevel: string;
  barcode: string;
  supplier: string;
  bulkPrice: string;
  bulkUnits: string;
  isAvailable: boolean;
  isActive: boolean;
}

const emptyForm: FormData = {
  name: '',
  brand: '',
  category: '',
  size: '',
  abv: '',
  sellingPrice: '',
  purchasePrice: '',
  stockLevel: '0',
  minStockLevel: '5',
  barcode: '',
  supplier: '',
  bulkPrice: '',
  bulkUnits: '',
  isAvailable: true,
  isActive: true,
};

function productToForm(p: Product): FormData {
  return {
    name: p.name,
    brand: p.brand ?? '',
    category: p.category,
    size: p.size ?? '',
    abv: p.abv != null ? String(p.abv) : '',
    sellingPrice: (p.selling_price_cents / 100).toFixed(2),
    purchasePrice: (p.purchase_price_cents / 100).toFixed(2),
    stockLevel: String(p.stock_level),
    minStockLevel: String(p.min_stock_level),
    barcode: p.barcode ?? '',
    supplier: p.supplier ?? '',
    bulkPrice: p.bulk_price_cents ? (p.bulk_price_cents / 100).toFixed(2) : '',
    bulkUnits: p.bulk_units ? String(p.bulk_units) : '',
    isAvailable: p.is_available ?? true,
    isActive: p.is_active ?? true,
  };
}

export default function ProductDrawer({ open, product, onClose, onSaved }: ProductDrawerProps) {
  const { venueId } = useVenue();
  const isEdit = !!product;
  const [form, setForm] = useState<FormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(product ? productToForm(product) : emptyForm);
      setErrors({});
    }
  }, [open, product]);

  const set = (key: keyof FormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    else if (form.name.length > 100) e.name = 'Max 100 characters';
    if (!form.category) e.category = 'Category is required';
    const sp = parseFloat(form.sellingPrice);
    if (isNaN(sp) || sp <= 0) e.sellingPrice = 'Must be greater than 0';
    const sl = parseInt(form.stockLevel);
    if (isNaN(sl) || sl < 0) e.stockLevel = 'Must be 0 or more';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);

    const record = {
      venue_id: venueId,
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category,
      size: form.size.trim() || null,
      abv: form.abv ? parseFloat(form.abv) : null,
      selling_price_cents: Math.round(parseFloat(form.sellingPrice) * 100),
      purchase_price_cents: form.purchasePrice ? Math.round(parseFloat(form.purchasePrice) * 100) : 0,
      stock_level: parseInt(form.stockLevel),
      min_stock_level: parseInt(form.minStockLevel) || 5,
      barcode: form.barcode.trim() || null,
      supplier: form.supplier.trim() || null,
      bulk_price_cents: form.bulkPrice ? Math.round(parseFloat(form.bulkPrice) * 100) : null,
      bulk_units: form.bulkUnits ? parseInt(form.bulkUnits) : null,
      is_available: form.isAvailable,
      is_active: form.isActive,
    };

    let error;
    if (isEdit && product) {
      ({ error } = await supabase.from('liquor_products').update(record).eq('id', product.id));
    } else {
      ({ error } = await supabase.from('liquor_products').insert(record));
    }

    setSaving(false);
    if (error) {
      toast.error('Failed to save product — please try again');
    } else {
      onSaved();
      onClose();
    }
  }

  if (!open) return null;

  const field = (
    label: string,
    key: keyof FormData,
    type = 'text',
    opts?: { prefix?: string; placeholder?: string }
  ) => (
    <div>
      <Label className="text-sm font-medium">{label}</Label>
      <div className="relative mt-1">
        {opts?.prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {opts.prefix}
          </span>
        )}
        <Input
          type={type}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value)}
          placeholder={opts?.placeholder}
          className={`${opts?.prefix ? 'pl-7' : ''} ${errors[key] ? 'border-destructive' : ''}`}
        />
      </div>
      {errors[key] && <p className="text-xs text-destructive mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[480px] h-full bg-card shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="text-lg font-semibold text-foreground">
            {isEdit ? 'Edit Product' : 'Add Product'}
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {field('Name', 'name', 'text', { placeholder: 'e.g. Castle Lager' })}
          {field('Brand', 'brand', 'text', { placeholder: 'e.g. SAB' })}

          <div>
            <Label className="text-sm font-medium">Category</Label>
            <Select value={form.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger className={`mt-1 ${errors.category ? 'border-destructive' : ''}`}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-destructive mt-1">{errors.category}</p>}
          </div>

          {field('Size', 'size', 'text', { placeholder: 'e.g. 340ml' })}
          {field('ABV (%)', 'abv', 'number', { placeholder: 'e.g. 5.0' })}
          {field('Selling Price (R)', 'sellingPrice', 'number', { prefix: 'R', placeholder: '35.00' })}
          {field('Purchase Price (R)', 'purchasePrice', 'number', { prefix: 'R', placeholder: '20.00' })}
          {field('Stock Level', 'stockLevel', 'number')}
          {field('Minimum Stock Level', 'minStockLevel', 'number')}
          {field('Barcode', 'barcode')}
          {field('Supplier', 'supplier')}
          {field('Bulk Price per Unit (R)', 'bulkPrice', 'number', { prefix: 'R' })}
          {field('Units per Bulk', 'bulkUnits', 'number', { placeholder: 'e.g. 24' })}

          <div className="flex items-center justify-between py-1">
            <Label className="text-sm font-medium">Available on POS</Label>
            <Switch checked={form.isAvailable} onCheckedChange={(v) => set('isAvailable', v)} />
          </div>

          <div className="flex items-center justify-between py-1">
            <Label className="text-sm font-medium">Active</Label>
            <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update Product' : 'Add Product'}
          </Button>
        </div>
      </div>
    </div>
  );
}
