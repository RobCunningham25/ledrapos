import { Wine } from 'lucide-react';

export default function PortalBarTab() {
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 136px)' }}>
      <Wine size={48} color="#718096" />
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A202C', marginTop: 12 }}>Bar Tab</h2>
      <p style={{ fontSize: 14, color: '#718096', marginTop: 4 }}>Loading your tab...</p>
    </div>
  );
}
