import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOSAuth } from '@/contexts/POSAuthContext';
import PINLogin from '@/components/pos/PINLogin';
import LockScreen from '@/components/pos/LockScreen';
import { Button } from '@/components/ui/button';

const POS = () => {
  const { currentUser, isAuthenticated, isLocked, refreshActivity, logout, setIsLocked } = usePOSAuth();
  const navigate = useNavigate();

  // Activity tracking
  useEffect(() => {
    if (!currentUser) return;

    const handler = () => refreshActivity();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
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

  const handleLogout = async () => {
    await logout();
    navigate('/pos');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page relative">
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {currentUser.name} <span className="text-xs">({currentUser.role})</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setIsLocked(true)}
        >
          Test Lock
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={handleLogout}
        >
          Log Out
        </Button>
      </div>
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
