'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { PrizeModal } from '@/components/prizes/prize-modal';

export type PrizeType = 'REGISTER' | 'LOGIN' | 'TWO_WALLETS' | 'TELEGRAM' | 'TRIGGER';

interface PrizeContextValue {
  triggerPrize: (type: PrizeType) => void;
}

const PrizeContext = createContext<PrizeContextValue>({ triggerPrize: () => {} });

export function usePrize() {
  return useContext(PrizeContext);
}

export function PrizeProvider({ children }: { children: React.ReactNode }) {
  const [activePrize, setActivePrize] = useState<PrizeType | null>(null);
  const [mounted, setMounted] = useState(false);
  const checked = useRef(false);

  const triggerPrize = useCallback((type: PrizeType) => {
    if (localStorage.getItem(`prize_claimed_${type}`)) return;
    setActivePrize(type);
  }, []);

  const handleClaim = useCallback(() => {
    if (activePrize) {
      localStorage.setItem(`prize_claimed_${activePrize}`, 'true');
    }
    setActivePrize(null);
  }, [activePrize]);

  useEffect(() => {
    setMounted(true);
    if (checked.current) return;
    checked.current = true;
    const pending = localStorage.getItem('pending_prize') as PrizeType | null;
    if (pending) {
      localStorage.removeItem('pending_prize');
      triggerPrize(pending);
    }
  }, [triggerPrize]);

  return (
    <PrizeContext.Provider value={{ triggerPrize }}>
      {children}
      {mounted && activePrize && (
        <PrizeModal
          type={activePrize}
          onClose={() => setActivePrize(null)}
          onClaim={handleClaim}
        />
      )}
    </PrizeContext.Provider>
  );
}
