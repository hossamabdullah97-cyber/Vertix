import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useSession } from './session';

/**
 * Reads a path in the open workspace: loading, the data, an error, and a way
 * to read it again (pull to refresh). Read again when the workspace changes.
 */
export function useApi<T>(path: string | null) {
  const { workspace } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (pull = false) => {
      if (!path) return;
      const n = ++seq.current;
      if (pull) setRefreshing(true);
      else setLoading(true);
      try {
        const d = await api<T>(path);
        if (n === seq.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (n === seq.current) setError((e as Error).message);
      } finally {
        if (n === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  useEffect(() => {
    void load();
  }, [load, workspace?.org.id]);

  return { data, setData, error, loading, refreshing, reload: () => load(true) };
}
