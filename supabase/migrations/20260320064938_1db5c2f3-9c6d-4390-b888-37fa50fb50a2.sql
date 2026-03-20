CREATE OR REPLACE FUNCTION public.process_payment(
  p_venue_id       UUID,
  p_tab_id         UUID,
  p_member_id      UUID DEFAULT NULL,
  p_credit_amount  INTEGER DEFAULT 0,
  p_cash_amount    INTEGER DEFAULT 0,
  p_card_amount    INTEGER DEFAULT 0,
  p_card_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tab RECORD;
  v_tab_total_cents INTEGER;
  v_current_credit INTEGER;
  v_total_paid INTEGER;
  v_new_credit_balance INTEGER;
BEGIN
  SELECT * INTO v_tab
  FROM tabs
  WHERE id = p_tab_id AND venue_id = p_venue_id AND status = 'OPEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tab not found or already closed';
  END IF;

  SELECT COALESCE(SUM(line_total_cents), 0) INTO v_tab_total_cents
  FROM tab_items
  WHERE tab_id = p_tab_id AND venue_id = p_venue_id;

  IF p_member_id IS NOT NULL AND p_credit_amount > 0 THEN
    SELECT COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount_cents ELSE -amount_cents END), 0)
    INTO v_current_credit
    FROM member_credits
    WHERE member_id = p_member_id AND venue_id = p_venue_id;

    IF p_credit_amount > v_current_credit THEN
      RAISE EXCEPTION 'Insufficient credit balance';
    END IF;

    INSERT INTO member_credits (venue_id, member_id, amount_cents, type, method, description)
    VALUES (p_venue_id, p_member_id, p_credit_amount, 'DEBIT', 'ADJUSTMENT', 'Tab payment');

    INSERT INTO payments (venue_id, tab_id, amount_cents, method, reference)
    VALUES (p_venue_id, p_tab_id, p_credit_amount, 'CREDIT', NULL);
  END IF;

  IF p_cash_amount > 0 THEN
    INSERT INTO payments (venue_id, tab_id, amount_cents, method, reference)
    VALUES (p_venue_id, p_tab_id, p_cash_amount, 'CASH', NULL);
  END IF;

  IF p_card_amount > 0 THEN
    INSERT INTO payments (venue_id, tab_id, amount_cents, method, reference)
    VALUES (p_venue_id, p_tab_id, p_card_amount, 'CARD', p_card_reference);
  END IF;

  v_total_paid := COALESCE(p_credit_amount, 0) + COALESCE(p_cash_amount, 0) + COALESCE(p_card_amount, 0);

  IF v_total_paid >= v_tab_total_cents THEN
    UPDATE tabs SET status = 'CLOSED', closed_at = NOW()
    WHERE id = p_tab_id AND venue_id = p_venue_id;
  END IF;

  v_new_credit_balance := NULL;
  IF p_member_id IS NOT NULL AND p_credit_amount > 0 THEN
    SELECT COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount_cents ELSE -amount_cents END), 0)
    INTO v_new_credit_balance
    FROM member_credits
    WHERE member_id = p_member_id AND venue_id = p_venue_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tab_closed', (v_total_paid >= v_tab_total_cents),
    'credit_applied', COALESCE(p_credit_amount, 0),
    'cash_paid', COALESCE(p_cash_amount, 0),
    'card_paid', COALESCE(p_card_amount, 0),
    'new_credit_balance', v_new_credit_balance,
    'tab_total', v_tab_total_cents,
    'change_due', GREATEST(0, v_total_paid - v_tab_total_cents)
  );
END;
$$;