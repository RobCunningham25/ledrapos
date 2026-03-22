import { Calendar } from 'lucide-react';

export default function PortalCalendar() {
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 136px)' }}>
      <Calendar size={48} color="#718096" />
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A202C', marginTop: 12 }}>Club Calendar</h2>
      <p style={{ fontSize: 14, color: '#718096', marginTop: 4 }}>Coming soon</p>
    </div>
  );
}
