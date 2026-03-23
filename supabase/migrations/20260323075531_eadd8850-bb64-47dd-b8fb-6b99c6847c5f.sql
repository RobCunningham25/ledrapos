-- Add booking_id column to checkout_sessions
ALTER TABLE checkout_sessions ADD COLUMN booking_id UUID REFERENCES bookings(id);

-- Update purpose CHECK to include booking_payment
ALTER TABLE checkout_sessions DROP CONSTRAINT checkout_sessions_purpose_check;
ALTER TABLE checkout_sessions ADD CONSTRAINT checkout_sessions_purpose_check 
  CHECK (purpose IN ('credit_load', 'tab_payment', 'booking_payment'));