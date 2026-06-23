'use client';

import { createContext, useContext, useEffect, useRef } from 'react';

export type PrizeType = 'REGISTER' | 'LOGIN' | 'TWO_WALLETS' | 'TELEGRAM' | 'TRIGGER';

interface PrizeContextValue {
  triggerPrize: (type: PrizeType) => void;
}

const PrizeContext = createContext<PrizeContextValue>({ triggerPrize: () => {} });

export function usePrize() {
  return useContext(PrizeContext);
}

export function PrizeProvider({ children }: { children: React.ReactNode }) {
  const checked = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const triggerPrize = (_type: PrizeType) => {};

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    localStorage.removeItem('pending_prize');
  }, []);

  return (
    <PrizeContext.Provider value={{ triggerPrize }}>
      {children}
    </PrizeContext.Provider>
  );
}
