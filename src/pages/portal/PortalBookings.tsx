import { BedDouble } from 'lucide-react';
import { PORTAL_THEME as T } from '@/constants/portalTheme';

export default function PortalBookings() {
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 136px)' }}>
      <div style={{
        background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12,
        padding: 40, maxWidth: 400, width: '100%', textAlign: 'center',
        boxShadow: T.cardShadow,
      }}>
        <BedDouble size={48} color={T.teal} />
        <h2 style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary, marginTop: 12 }}>Bookings Coming Soon</h2>
        <p style={{ fontSize: 14, color: T.textMuted, marginTop: 4 }}>Caravan, camping, and day visitor bookings will be available here</p>
      </div>
    </div>
  );
}
