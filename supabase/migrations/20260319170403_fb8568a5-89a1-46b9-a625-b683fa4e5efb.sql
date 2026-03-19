
CREATE OR REPLACE FUNCTION public.commit_cart_items(
  p_venue_id UUID,
  p_member_id UUID DEFAULT NULL,
  p_is_cash_customer BOOLEAN DEFAULT FALSE,
  p_cash_customer_name TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tab_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty INT;
  v_unit_price_cents INT;
  v_current_stock INT;
  v_existing_item_id UUID;
  v_result JSONB;
BEGIN
  IF p_member_id IS NOT NULL THEN
    SELECT id INTO v_tab_id
    FROM tabs
    WHERE venue_id = p_venue_id AND member_id = p_member_id AND status = 'OPEN'
    LIMIT 1;

    IF v_tab_id IS NULL THEN
      INSERT INTO tabs (venue_id, member_id, is_cash_customer, status)
      VALUES (p_venue_id, p_member_id, FALSE, 'OPEN')
      RETURNING id INTO v_tab_id;
    END IF;
  ELSIF p_is_cash_customer THEN
    SELECT id INTO v_tab_id
    FROM tabs
    WHERE venue_id = p_venue_id
      AND is_cash_customer = TRUE
      AND status = 'OPEN'
      AND cash_customer_name = COALESCE(p_cash_customer_name, 'Cash Customer')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_tab_id IS NULL THEN
      RAISE EXCEPTION 'No open cash customer tab found';
    END IF;
  ELSE
    RAISE EXCEPTION 'Either member_id or is_cash_customer must be provided';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'qty')::INT;
    v_unit_price_cents := (v_item->>'unit_price_cents')::INT;

    SELECT stock_level INTO v_current_stock
    FROM liquor_products
    WHERE id = v_product_id
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found: %', v_product_id;
    END IF;

    IF v_current_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %', (SELECT name FROM liquor_products WHERE id = v_product_id);
    END IF;

    SELECT id INTO v_existing_item_id
    FROM tab_items
    WHERE tab_id = v_tab_id AND product_id = v_product_id;

    IF v_existing_item_id IS NOT NULL THEN
      UPDATE tab_items
      SET qty = qty + v_qty
      WHERE id = v_existing_item_id;
    ELSE
      INSERT INTO tab_items (venue_id, tab_id, product_id, qty, unit_price_cents)
      VALUES (p_venue_id, v_tab_id, v_product_id, v_qty, v_unit_price_cents);
    END IF;

    UPDATE liquor_products
    SET stock_level = stock_level - v_qty
    WHERE id = v_product_id;
  END LOOP;

  SELECT jsonb_build_object(
    'tab_id', v_tab_id,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ti.id,
        'product_id', ti.product_id,
        'qty', ti.qty,
        'unit_price_cents', ti.unit_price_cents,
        'line_total_cents', ti.line_total_cents,
        'product_name', lp.name,
        'product_brand', lp.brand,
        'product_size', lp.size
      ))
      FROM tab_items ti
      JOIN liquor_products lp ON lp.id = ti.product_id
      WHERE ti.tab_id = v_tab_id
    ), '[]'::JSONB)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
