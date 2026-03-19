import { useEffect } from 'react';
import { usePOSAuth } from '@/contexts/POSAuthContext';
import PINLogin from '@/components/pos/PINLogin';
import LockScreen from '@/components/pos/LockScreen';

const POS = () => {
  const { currentUser, isAuthenticated, isLocked, refreshActivity } = usePOSAuth();

  // Activity tracking
  useEffect(() => {
    if (!currentUser) return;

    const handler = () => refreshActivity();
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
    };
  }, [currentUser, refreshActivity]);

  if (!currentUser) {
    return <PINLogin />;
  }

  if (isLocked) {
    return <LockScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          POS Till — authenticated as {currentUser.name}
        </h1>
        <p className="mt-2 text-muted-foreground">Role: {currentUser.role}</p>
      </div>
    </div>
  );
};

export default POS;
