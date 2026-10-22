'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, ListTree } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';

/** Shows the jump button once the reader has scrolled this far. */
const SHOW_AFTER_PX = 500;

/**
 * A small floating button for long dashboards: it lists the page sections marked with
 * `data-jump="<label>"` (in page order) plus "Top", and scrolls to the chosen one.
 */
export function SectionJump() {
  const t = useTranslations('DashboardSections');
  const [visible, setVisible] = useState(false);
  const [sections, setSections] = useState<{ label: string; element: HTMLElement }[]>([]);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function collect(open: boolean) {
    if (!open) return;
    setSections(
      [...document.querySelectorAll<HTMLElement>('[data-jump]')]
        .filter((element) => element.offsetParent !== null)
        .map((element) => ({ label: element.dataset.jump ?? '', element })),
    );
  }

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';

  return (
    <div
      className={cn(
        'fixed right-3 z-30 transition-all duration-200 motion-reduce:transition-none',
        // Above the mobile bottom bar and the iPhone home indicator.
        'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:right-6',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <DropdownMenu onOpenChange={collect}>
        <DropdownMenuTrigger
          aria-label={t('jumpTo')}
          title={t('jumpTo')}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/80 text-text shadow-card backdrop-blur transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ListTree className="h-4 w-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-48">
          <DropdownMenuItem onSelect={() => window.scrollTo({ top: 0, behavior })}>
            <ArrowUp className="mr-2 h-4 w-4" aria-hidden />
            {t('jumpTop')}
          </DropdownMenuItem>
          {sections.map(({ label, element }) => (
            <DropdownMenuItem
              key={label}
              onSelect={() => element.scrollIntoView({ behavior, block: 'start' })}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
