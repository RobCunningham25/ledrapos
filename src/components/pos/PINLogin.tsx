import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOSAuth } from '@/contexts/POSAuthContext';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { Loader2 } from 'lucide-react';

const MAX_PIN_LENGTH = 6;

const PINLogin = () => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = usePOSAuth();
  const { venueName } = useVenue();
  const navigate = useNavigate();

  const handleDigit = (digit: string) => {
    if (loading || pin.length >= MAX_PIN_LENGTH) return;
    setError('');
    setPin((prev) => prev + digit);
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleLogin = async () => {
    if (!pin || loading) return;
    setLoading(true);
    setError('');
    const result = await login(pin);
    setLoading(false);
    if (result.success) {
      navigate('/pos');
    } else {
      setPin('');
      setError(result.error || 'Invalid PIN, please try again');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-[400px] rounded-lg border border-border bg-card p-10 shadow-subtle">
        <div className="mb-8 text-center">
          <h1 className="text-[28px] font-bold text-primary">LedraPOS</h1>
          <p className="mt-1 text-sm text-muted-foreground">{venueName}</p>
        </div>

        {/* PIN dots */}
        <div className="mb-6 flex justify-center gap-3">
          {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-colors duration-100 ${
                i < pin.length
                  ? 'border-primary bg-primary'
                  : 'border-border bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="mb-4 text-center text-sm font-medium text-destructive">{error}</p>
        )}

        {/* Numpad */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''].map((digit, i) => (
            <button
              key={i}
              type="button"
              disabled={loading || !digit}
              onClick={() => digit && handleDigit(digit)}
              className={`flex h-[72px] w-full items-center justify-center rounded-lg border text-2xl font-semibold transition-colors duration-100 ${
                digit
                  ? 'border-border bg-card text-foreground active:bg-primary active:text-primary-foreground'
                  : 'pointer-events-none border-transparent bg-transparent'
              }`}
            >
              {digit}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleClear}
            disabled={loading}
            className="flex h-12 w-full items-center justify-center rounded-md bg-muted text-base font-medium text-muted-foreground transition-colors duration-100"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading || !pin}
            className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-base font-medium text-primary-foreground transition-colors duration-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PINLogin;
