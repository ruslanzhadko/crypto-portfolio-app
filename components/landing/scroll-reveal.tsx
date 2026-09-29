'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type RevealVariant = 'soft' | 'left' | 'right' | 'sequence';

export function ScrollReveal({
  children,
  className,
  variant = 'soft',
}: {
  children: ReactNode;
  className?: string;
  variant?: RevealVariant;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (
      !node ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    node.dataset.motionReady = 'true';

    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) {
      node.dataset.motionVisible = 'true';
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        node.dataset.motionVisible = 'true';
        observer.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn('landing-reveal', className)}
      data-motion={variant}
    >
      {children}
    </div>
  );
}
