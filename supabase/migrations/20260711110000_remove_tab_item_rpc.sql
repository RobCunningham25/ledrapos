-- Allow bartenders to remove committed items from an open tab.
-- Removes p_qty units (NULL = whole line), restores stock, and deletes the
-- tab itself if it ends up with no items and no payments (tabs only exist
-- from first commit, so an empty unpaid tab should not linger).
CREATE OR REPLACE FUNCTION public.remove_tab_item(
  p_venue_id uuid,
  p_tab_item_id uuid,
  p_qty integer DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_tab_id UUID;
  v_product_id UUID;
  v_item_qty INT;
  v_tab_status TEXT;
  v_remove INT;
  v_remaining_items INT;
  v_payment_count INT;
  v_tab_deleted BOOLEAN := FALSE;
BEGIN
  SELECT ti.tab_id, ti.product_id, ti.qty, t.status
  INTO v_tab_id, v_product_id, v_item_qty, v_tab_status
  FROM tab_items ti
  JOIN tabs t ON t.id = ti.tab_id
  WHERE ti.id = p_tab_item_id
    AND ti.venue_id = p_venue_id
  FOR UPDATE OF ti, t;

  IF v_tab_id IS NULL THEN
    RAISE EXCEPTION 'Tab item not found';
  END IF;

  IF v_tab_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Cannot modify items on a closed tab';
  END IF;

  v_remove := LEAST(GREATEST(COALESCE(p_qty, v_item_qty), 1), v_item_qty);

  IF v_remove >= v_item_qty THEN
    DELETE FROM tab_items WHERE id = p_tab_item_id;
  ELSE
    UPDATE tab_items SET qty = qty - v_remove WHERE id = p_tab_item_id;
  END IF;

  UPDATE liquor_products
  SET stock_level = stock_level + v_remove
  WHERE id = v_product_id;

  SELECT COUNT(*) INTO v_remaining_items FROM tab_items WHERE tab_id = v_tab_id;
  SELECT COUNT(*) INTO v_payment_count FROM payments WHERE tab_id = v_tab_id;

  IF v_remaining_items = 0 AND v_payment_count = 0 THEN
    DELETE FROM tabs WHERE id = v_tab_id;
    v_tab_deleted := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'tab_id', v_tab_id,
    'removed_qty', v_remove,
    'tab_deleted', v_tab_deleted
  );
END;
$$;
