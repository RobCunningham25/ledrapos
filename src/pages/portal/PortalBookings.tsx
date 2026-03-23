import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { toast } from 'sonner';
import { differenceInCalendarDays } from 'date-fns';

import BookingStepIndicator from '@/components/portal/booking/BookingStepIndicator';
import BookingTypeStep from '@/components/portal/booking/BookingTypeStep';
import BookingDatesStep, { getPerNightPrice, type BookingSite } from '@/components/portal/booking/BookingDatesStep';
import BookingDetailsStep from '@/components/portal/booking/BookingDetailsStep';
import BookingReviewStep from '@/components/portal/booking/BookingReviewStep';
import BookingConfirmation from '@/components/portal/booking/BookingConfirmation';
import EFTDetailsScreen from '@/components/portal/booking/EFTDetailsScreen';
import MyBookingsList from '@/components/portal/booking/MyBookingsList';

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateBookingCode(): string {
  let code = 'VCA-';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export default function PortalBookings() {
  const { member } = usePortalAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [siteType, setSiteType] = useState<'caravan' | 'camping' | 'day_visitor' | null>(null);
  const [sites, setSites] = useState<BookingSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [numGuests, setNumGuests] = useState(1);
  const [guestName, setGuestName] = useState(member ? `${member.first_name} ${member.last_name}` : '');
  const [guestEmail, setGuestEmail] = useState(member?.email || '');
  const [guestPhone, setGuestPhone] = useState(member?.phone || '');
  const [notes, setNotes] = useState('');
  const [bookingFor, setBookingFor] = useState<'self' | 'visitor'>('self');
  const [confirmedCode, setConfirmedCode] = useState<string | null>(null);
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showEFT, setShowEFT] = useState(false);

  const venueId = member?.venue_id || '';
  const selectedSite = useMemo(() => sites.find(s => s.id === selectedSiteId), [sites, selectedSiteId]);

  const isDayVisitor = siteType === 'day_visitor';
  const nights = useMemo(() => {
    if (isDayVisitor) return 1;
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  }, [checkIn, checkOut, isDayVisitor]);

  const perNight = useMemo(() => selectedSite ? getPerNightPrice(selectedSite, numGuests) : 0, [selectedSite, numGuests]);
  const totalCents = isDayVisitor ? 0 : nights * perNight;

  const handleTypeSelect = useCallback((type: 'caravan' | 'camping' | 'day_visitor', typeSites: BookingSite[]) => {
    setSiteType(type);
    setSites(typeSites);
    setSelectedSiteId(null);
    setCheckIn(''); setCheckOut('');
    setNumGuests(1);
    setStep(2);
  }, []);

  const handleBookingForChange = useCallback((val: 'self' | 'visitor') => {
    setBookingFor(val);
    if (val === 'self' && member) {
      setGuestName(`${member.first_name} ${member.last_name}`);
      setGuestEmail(member.email || '');
      setGuestPhone(member.phone || '');
    } else if (val === 'visitor') {
      setGuestName('');
      setGuestEmail('');
      setGuestPhone('');
    }
  }, [member]);

  const handleDetailChange = useCallback((field: 'guestName' | 'guestEmail' | 'guestPhone' | 'notes', value: string) => {
    if (field === 'guestName') setGuestName(value);
    else if (field === 'guestEmail') setGuestEmail(value);
    else if (field === 'guestPhone') setGuestPhone(value);
    else setNotes(value);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!member || !selectedSiteId || !selectedSite) return;

    const bookingCode = generateBookingCode();
    const isFree = totalCents === 0;
    const isVisitor = bookingFor === 'visitor';

    const { data: booking, error } = await supabase.from('bookings').insert({
      venue_id: venueId,
      booking_code: bookingCode,
      member_id: isVisitor ? null : member.id,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone || null,
      membership_number: isVisitor ? null : member.membership_number,
      check_in: checkIn,
      check_out: isDayVisitor ? checkIn : checkOut,
      num_guests: numGuests,
      total_price_cents: totalCents,
      status: isFree ? 'PAID' : 'PENDING',
      payment_method: null,
      notes: notes || null,
      created_by_member_id: member.id,
    }).select('id').single();

    if (error || !booking) {
      toast.error(error?.message || 'Failed to create booking');
      return;
    }

    const { error: linkError } = await supabase.from('booking_site_link').insert({
      venue_id: venueId,
      booking_id: booking.id,
      site_id: selectedSiteId,
      nights,
      price_per_night_cents: perNight,
      subtotal_cents: totalCents,
    });

    if (linkError) {
      toast.error('Booking created but site link failed');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['portal-my-bookings'] });
    setConfirmedCode(bookingCode);
    setConfirmedBookingId(booking.id);
  }, [member, selectedSiteId, selectedSite, venueId, guestName, guestEmail, guestPhone, checkIn, checkOut, isDayVisitor, numGuests, totalCents, notes, nights, perNight, queryClient, bookingFor]);

  const handleSelectPayment = useCallback(async (method: 'card' | 'eft') => {
    if (!confirmedBookingId || !member) return;

    if (method === 'card') {
      setPaymentLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: {
            member_id: member.id,
            venue_id: member.venue_id,
            purpose: 'booking_payment',
            amount_cents: totalCents,
            booking_id: confirmedBookingId,
          },
        });
        if (error || !data?.redirect_url) {
          toast.error(data?.error || error?.message || 'Failed to create payment');
          setPaymentLoading(false);
          return;
        }
        window.location.href = data.redirect_url;
      } catch (e: any) {
        toast.error(e.message || 'Payment error');
        setPaymentLoading(false);
      }
    } else {
      await supabase.from('bookings').update({
        payment_method: 'eft',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', confirmedBookingId);

      await supabase.from('booking_payments').insert({
        venue_id: member.venue_id,
        booking_id: confirmedBookingId,
        amount_cents: totalCents,
        method: 'eft',
        status: 'pending',
      });

      queryClient.invalidateQueries({ queryKey: ['portal-my-bookings'] });
      setShowEFT(true);
    }
  }, [confirmedBookingId, member, totalCents, queryClient]);

  if (!member) return null;

  // EFT details screen
  if (showEFT && confirmedCode) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        <EFTDetailsScreen venueId={venueId} bookingCode={confirmedCode} totalCents={totalCents} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: T.navy, marginBottom: 8 }}>Book</h1>

      <MyBookingsList venueId={venueId} memberId={member.id} />

      {confirmedCode ? (
        <BookingConfirmation
          bookingCode={confirmedCode}
          isFree={totalCents === 0}
          bookingId={confirmedBookingId}
          totalCents={totalCents}
          bookingFor={bookingFor}
          guestName={guestName}
          onSelectPayment={totalCents > 0 && bookingFor === 'self' ? handleSelectPayment : undefined}
          paymentLoading={paymentLoading}
        />
      ) : (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: T.navy, marginTop: 32, marginBottom: 16 }}>New Booking</h2>
          <BookingStepIndicator current={step} />

          {step === 1 && (
            <BookingTypeStep venueId={venueId} onSelect={handleTypeSelect} />
          )}

          {step === 2 && siteType && (
            <BookingDatesStep
              venueId={venueId} siteType={siteType} sites={sites}
              selectedSiteId={selectedSiteId} checkIn={checkIn} checkOut={checkOut} numGuests={numGuests}
              onSiteSelect={setSelectedSiteId} onCheckInChange={setCheckIn} onCheckOutChange={setCheckOut}
              onGuestsChange={setNumGuests} onNext={() => setStep(3)} onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <BookingDetailsStep
              guestName={guestName} guestEmail={guestEmail} guestPhone={guestPhone} notes={notes}
              memberName={`${member.first_name} ${member.last_name}`} membershipNumber={member.membership_number}
              bookingFor={bookingFor} onBookingForChange={handleBookingForChange}
              onChange={handleDetailChange} onNext={() => setStep(4)} onBack={() => setStep(2)}
            />
          )}

          {step === 4 && selectedSite && (
            <BookingReviewStep
              siteType={siteType!} siteName={selectedSite.name}
              checkIn={checkIn} checkOut={isDayVisitor ? checkIn : checkOut}
              nights={nights} numGuests={numGuests}
              perNightCents={perNight} totalCents={totalCents}
              guestName={guestName} guestEmail={guestEmail} guestPhone={guestPhone}
              membershipNumber={member.membership_number} notes={notes}
              bookingFor={bookingFor} memberName={`${member.first_name} ${member.last_name}`}
              onBack={() => setStep(3)} onEditStep={setStep} onConfirm={handleConfirm}
            />
          )}
        </>
      )}
    </div>
  );
}
