'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface FaqItem {
  q: string;
  a: string;
}

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="flex min-h-14 w-full items-center justify-between gap-4 py-5 text-left text-base font-semibold tracking-[-0.01em] transition-colors hover:text-primary focus-visible:text-primary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {item.q}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-text-muted transition-transform duration-300',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <p className="landing-copy max-w-[65ch] pb-5 pr-8 text-sm text-text-muted">
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function LandingFaq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-border">
      {items.map((item) => (
        <FaqRow key={item.q} item={item} />
      ))}
    </div>
  );
}
