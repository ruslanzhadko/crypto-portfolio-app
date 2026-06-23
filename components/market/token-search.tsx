'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TokenLogo } from '@/components/common/token-logo';
import type { SearchResult } from '@/lib/services/coingecko';
import { cn } from '@/lib/utils/cn';

export function TokenSearch() {
  const router = useRouter();
  const t = useTranslations('Market');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = (await res.json()) as { results: SearchResult[] };
        setResults(data.results);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(id: string) {
    setOpen(false);
    setQuery('');
    router.push(`/market/${id}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('tokenSearchPlaceholder')}
        className="pl-9"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" />
      )}
      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-lg border border-border bg-popover shadow-card">
          {results.length === 0 && !loading && (
            <div className="p-4 text-sm text-text-muted">{t('tokenSearchEmpty')}</div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => select(r.id)}
              className={cn(
                'flex w-full items-center gap-3 border-b border-border/40 px-4 py-2 text-left text-sm transition-colors hover:bg-surface-2 last:border-b-0',
              )}
            >
              <TokenLogo src={r.thumb} symbol={r.symbol} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-xs uppercase text-text-muted">{r.symbol}</p>
              </div>
              {r.marketCapRank && (
                <span className="text-xs text-text-muted">#{r.marketCapRank}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
