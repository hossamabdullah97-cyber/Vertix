import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { activeOrg, api, hasSession, logout, onSignedOut, setActiveOrg } from './api';

export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export interface Me {
  id: string;
  sub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  orgId?: string;
  role?: Role;
  customRole?: { id: string; name: string; capabilities: string[] } | null;
  isSuperAdmin?: boolean;
  emailVerified?: boolean;
}

export interface Workspace {
  org: { id: string; name: string; slug: string; kind: 'PERSONAL' | 'TEAM' | string };
  role: Role;
}

interface SessionState {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  /** Reads the person and their workspaces again (after signing in, or a change). */
  refresh: () => Promise<void>;
  switchTo: (orgId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

/**
 * Who is signed in, and in which workspace: the same account and workspaces
 * as on the website. Everything the app shows is read in the open workspace.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!(await hasSession())) {
      setStatus('signedOut');
      return;
    }
    try {
      const list = await api<Workspace[]>('/orgs');
      // The workspace this phone had open, while the person is still in it; else the first.
      let open = await activeOrg();
      if (!open || !list.some((w) => w.org.id === open)) {
        open = list[0]?.org.id ?? null;
        await setActiveOrg(open);
      }
      const person = await api<Me>('/auth/me');
      setWorkspaces(list);
      setOrgId(open);
      setMe(person);
      setStatus('signedIn');
    } catch {
      setStatus((await hasSession()) ? 'signedIn' : 'signedOut');
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onSignedOut(() => {
      setMe(null);
      setWorkspaces([]);
      setOrgId(null);
      setStatus('signedOut');
    });
  }, [refresh]);

  const switchTo = useCallback(async (id: string) => {
    await setActiveOrg(id);
    setOrgId(id);
    setMe(await api<Me>('/auth/me'));
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      status,
      me,
      workspaces,
      workspace: workspaces.find((w) => w.org.id === orgId) ?? null,
      refresh,
      switchTo,
      signOut: logout,
    }),
    [status, me, workspaces, orgId, refresh, switchTo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

/** The roles that see the whole workspace (a member sees their own leads). */
export function isManager(role?: Role | null) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}
