import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OpenTabsList from './OpenTabsList';

interface OpenTabsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
}

export default function OpenTabsDrawer({ isOpen, onClose, venueId }: OpenTabsDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[520px] h-full bg-card shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="text-lg font-semibold text-foreground">Open Bar Tabs</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <OpenTabsList venueId={venueId} onBeforeNavigate={onClose} />
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0">
          <Button
            variant="outline"
            className="w-full"
            onClick={onClose}
            style={{ height: 44, borderRadius: 6, fontWeight: 500 }}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
