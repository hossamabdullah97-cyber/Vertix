import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { cached, keep } from './cache';
import { useSession } from './session';

/**
 * Reads a path in the open workspace: loading, the data, an error, and a way
 * to read it again (pull to refresh). Read again when the workspace changes.
 * What was last read here shows at once, and stays when there is no
 * connection (savedAt then says from when).
 */
export function useApi<T>(path: string | null) {
  const { workspace } = useSession();
  const org = workspace?.org.id ?? null;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const seq = useRef(0);
  const shown = useRef(false);

  const load = useCallback(
    async (pull = false) => {
      if (!path) return;
      const n = ++seq.current;
      if (pull) setRefreshing(true);
      else setLoading(true);
      if (!pull && !shown.current) {
        const kept = await cached<T>(org, path);
        if (kept && n === seq.current && !shown.current) {
          setData(kept.data);
          setSavedAt(kept.at);
        }
      }
      try {
        const d = await api<T>(path);
        if (n === seq.current) {
          shown.current = true;
          setData(d);
          setError(null);
          setSavedAt(null);
          void keep(org, path, d);
        }
      } catch (e) {
        if (n !== seq.current) return;
        // No connection with something to show: show it, saying from when.
        const offline = e instanceof ApiError && e.status === 0;
        if (!offline || !(await cached(org, path))) setError((e as Error).message);
      } finally {
        if (n === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path, org],
  );

  useEffect(() => {
    // Another workspace (or path): nothing of the last one stays on screen.
    shown.current = false;
    setData(null);
    setSavedAt(null);
    void load();
  }, [load]);

  return { data, setData, error, loading, refreshing, savedAt, reload: () => load(true) };
}
