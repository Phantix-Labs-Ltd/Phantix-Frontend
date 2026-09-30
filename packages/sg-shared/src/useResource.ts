import { useCallback, useEffect, useState, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { isDemoMode } from "./api";

export type ResourceState<T> = {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
  demo: boolean;
  /** Imperatively patch the cached value (used by SSE live updates). */
  setData: React.Dispatch<React.SetStateAction<T>>;
};

// Simple in-memory cache for stale-while-revalidate
const _swrCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Load live API data, or demo-data when isDemoMode().
 *
 * ``pollMs`` turns the resource into a live one: it re-fetches on an interval so
 * a page showing backend-owned state (the tracker, the dashboard) reflects work
 * done elsewhere without a manual refresh. It is quiet — a poll never flips
 * ``loading`` and never clears data, so the page does not flicker every tick.
 */
export function useResource<T>(loader: () => Promise<T>, initial: T, cacheKey?: string, pollMs?: number): ResourceState<T> {
  const [data, setData] = useState<T>(() => {
    if (cacheKey && _swrCache.has(cacheKey)) {
      return _swrCache.get(cacheKey)!.data as T;
    }
    return initial;
  });
  const [loading, setLoading] = useState(!(cacheKey && _swrCache.has(cacheKey)));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const demo = isDemoMode();
  const mountedRef = useRef(true);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const hadCached = cacheKey && _swrCache.has(cacheKey);
    if (!hadCached) setLoading(true);
    setError(null);

    let cancelled = false;
    const run = (quiet: boolean) =>
      loader()
        .then((value) => {
          if (!mountedRef.current || cancelled) return;
          setData(value);
          if (cacheKey) _swrCache.set(cacheKey, { data: value, ts: Date.now() });
        })
        .catch((err: unknown) => {
          if (!mountedRef.current || cancelled) return;
          // A failed background poll keeps the last good data on screen.
          if (!hadCached && !quiet) setError(err instanceof Error ? err.message : "Failed to load");
        })
        .finally(() => {
          if (!mountedRef.current || cancelled) return;
          if (!quiet) setLoading(false);
        });

    void run(false);
    // Live resources refresh on an interval so work done in another app lands
    // here without a manual reload. 10s matches the platform's live-refresh bar.
    const timer = pollMs && pollMs > 0 ? window.setInterval(() => void run(true), pollMs) : undefined;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, demo, pollMs]);

  return { data, loading, error, reload, demo, setData };
}

/** Clear stale entries from SWR cache */
if (typeof window !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _swrCache) {
      if (now - v.ts > CACHE_TTL_MS) _swrCache.delete(k);
    }
  }, 30_000);
}

/**
 * Drop the in-memory stale-while-revalidate cache.
 *
 * The cache key is usually static ("audit", "command-center", "applications"),
 * so it must be cleared whenever the tenant changes (logout, demo↔real) —
 * otherwise a page renders the previous org's/demo data and any id taken from it
 * produces a foreign 403/404 on the next action.
 */
export function clearResourceCache(): void {
  _swrCache.clear();
}
