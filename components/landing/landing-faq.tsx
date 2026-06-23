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
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium transition-colors hover:text-primary"
        onClick={() => setOpen((v) => !v)}
      >
        {item.q}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-text-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && (
        <p className="pb-4 text-sm text-text-muted leading-relaxed">{item.a}</p>
      )}
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
