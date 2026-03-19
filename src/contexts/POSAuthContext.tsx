import { createContext, useContext, ReactNode } from 'react';

// Stub — implemented in Phase 2
interface POSAuthContextType {
  posUser: null;
  sessionId: null;
}

const POSAuthContext = createContext<POSAuthContextType>({ posUser: null, sessionId: null });

export function POSAuthProvider({ children }: { children: ReactNode }) {
  return (
    <POSAuthContext.Provider value={{ posUser: null, sessionId: null }}>
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth() {
  return useContext(POSAuthContext);
}
