'use client';

import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

/**
 * A one-row page header: the title, a small "i" that reveals the page description on demand,
 * and the page action on the right. Saves the vertical space a permanent subtitle takes on phones.
 */
export function PageTitle({
  title,
  info,
  details,
  children,
}: {
  title: string;
  info: string;
  /** Longer notes shown under the description when the "i" is open. */
  details?: string;
  children?: ReactNode;
}) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">{title}</h1>
        <button
          type="button"
          className="rounded-full p-1 text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={info}
          aria-expanded={showInfo}
          title={info}
          onClick={() => setShowInfo((value) => !value)}
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
        <div className="ml-auto shrink-0">{children}</div>
      </div>
      {showInfo && (
        <div className="mt-1 space-y-1 text-xs text-text-muted duration-200 animate-in fade-in-0 motion-reduce:animate-none">
          <p>{info}</p>
          {details && <p>{details}</p>}
        </div>
      )}
    </div>
  );
}
