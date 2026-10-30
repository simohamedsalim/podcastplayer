'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTick } from '@/store/tick';

/** Runs an IndexedDB query on mount, on dependency change, and whenever the library changes. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; loading: boolean } {
  const tick = useTick((s) => s.tick);
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const q = useRef(query);
  q.current = query;
  const run = useCallback(async () => {
    try { setData(await q.current()); } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run(); }, [tick, run, ...deps]);
  return { data, loading };
}
