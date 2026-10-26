import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import {
  aboutOf,
  identityOf,
  initialConfig,
  isQuick,
  lookOf,
  themeOf,
  valueKey,
  vcardWith,
  type CardAction,
  type CardSection,
  type FullCard,
  type Identity,
  type Look,
  type Platform,
} from './card-editor';

/** What the editor holds: who is on the card, the About, and how it looks. */
export interface Draft {
  identity: Identity;
  about: string;
  look: Look;
}

/** The card as it stands in the editor, for the website's preview page (/preview/<id>?live=1). */
export interface LiveCard {
  card: FullCard;
}

export type SaveState = 'saved' | 'saving' | 'error';

interface CardEditor {
  card: FullCard;
  draft: Draft;
  setIdentity: (patch: Partial<Identity>) => void;
  setAbout: (text: string) => void;
  setLook: (patch: Partial<Look>) => void;
  saveState: SaveState;
  saveError: string | null;
  retry: () => void;
  actions: CardAction[];
  addAction: (p: Platform, config: Record<string, unknown>) => Promise<CardAction>;
  patchAction: (a: CardAction, body: { config?: Record<string, unknown>; isActive?: boolean }) => Promise<void>;
  removeAction: (a: CardAction) => Promise<void>;
  moveAction: (a: CardAction, dir: -1 | 1) => Promise<void>;
  setPrimary: (a: CardAction, on: boolean) => Promise<void>;
  setPublished: (on: boolean) => Promise<void>;
  /** A new address; the server's refusal (taken, or not allowed) is thrown. */
  saveSlug: (slug: string) => Promise<void>;
  live: LiveCard;
}

const Ctx = createContext<CardEditor | null>(null);

export function useCardEditor(): CardEditor {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCardEditor outside CardEditorProvider');
  return v;
}

const draftOf = (card: FullCard): Draft => ({ identity: identityOf(card), about: aboutOf(card).text, look: lookOf(card) });
const byOrder = (list: CardAction[] = []) => [...list].sort((a, b) => a.order - b.order);

/** The part of the draft the server keeps, as one comparable string. */
const stored = (card: FullCard, d: Draft) => JSON.stringify([vcardWith(card, d.identity), themeOf(d.look), d.look.templateId, d.about.trim()]);

/**
 * One card being edited, shared by the editor's screens. What is typed or
 * chosen is saved on its own a moment later (as the website's Studio saves),
 * one save at a time; buttons, publishing and the address are saved at once.
 * Whatever is still waiting goes out when the editor closes.
 */
export function CardEditorProvider({ initial, children }: { initial: FullCard; children: ReactNode }) {
  const id = initial.id;
  const [card, setCard] = useState<FullCard>(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [actions, setActions] = useState<CardAction[]>(() => byOrder(initial.actions));
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);

  const cardRef = useRef(card);
  cardRef.current = card;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const savedRef = useRef(stored(initial, draftOf(initial)));
  const busy = useRef(false);
  const mounted = useRef(true);

  const persist = useCallback(async () => {
    if (busy.current) return;
    const base = cardRef.current;
    const d = draftRef.current;
    const want = stored(base, d);
    if (want === savedRef.current) {
      if (mounted.current) setSaveState('saved');
      return;
    }
    busy.current = true;
    if (mounted.current) setSaveState('saving');
    try {
      const updated = await api<FullCard>(`/cards/${id}`, {
        method: 'PATCH',
        json: { vcardData: vcardWith(base, d.identity), theme: themeOf(d.look), templateId: d.look.templateId },
      });
      let sections = base.sections ?? [];
      const about = aboutOf(base);
      const text = d.about.trim();
      if (text !== about.text.trim()) {
        if (about.section) {
          const s = await api<CardSection>(`/cards/${id}/sections/${about.section.id}`, { method: 'PATCH', json: { content: { ...about.section.content, body: text } } });
          sections = sections.map((x) => (x.id === s.id ? { ...x, ...s } : x));
        } else if (text) {
          const s = await api<CardSection>(`/cards/${id}/sections`, { method: 'POST', json: { type: 'BIO', content: { body: text } } });
          sections = [...sections, s];
        }
      }
      // The server may have named the card's address after its name.
      const next = { ...base, ...updated, sections, actions: base.actions };
      cardRef.current = next;
      savedRef.current = stored(next, d);
      if (mounted.current) {
        setCard(next);
        setSaveError(null);
      }
      busy.current = false;
      // More was typed meanwhile: that goes out too.
      if (stored(next, draftRef.current) !== savedRef.current) void persist();
      else if (mounted.current) setSaveState('saved');
    } catch (e) {
      busy.current = false;
      if (mounted.current) {
        setSaveState('error');
        setSaveError((e as Error).message);
      }
    }
  }, [id]);

  // A moment after the last change, as typing settles.
  useEffect(() => {
    if (stored(cardRef.current, draft) === savedRef.current) return;
    setSaveState('saving');
    const t = setTimeout(() => void persist(), 700);
    return () => clearTimeout(t);
  }, [draft, persist]);

  // Closing the editor sends what is still waiting.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void persist();
    };
  }, [persist]);

  const setIdentity = useCallback((patch: Partial<Identity>) => setDraft((d) => ({ ...d, identity: { ...d.identity, ...patch } })), []);
  const setAbout = useCallback((about: string) => setDraft((d) => ({ ...d, about })), []);
  const setLook = useCallback((patch: Partial<Look>) => setDraft((d) => ({ ...d, look: { ...d.look, ...patch } })), []);

  /** A phone or email given to a button is also the card's own, when it has none, so the saved contact carries it. */
  const fillContact = useCallback(
    (type: CardAction['type'], config: Record<string, unknown>) => {
      const key = valueKey(type);
      const value = key ? config[key] : null;
      if (typeof value !== 'string' || !value.trim()) return;
      if (key === 'phone' && !draftRef.current.identity.phone) setIdentity({ phone: value.trim() });
      if (key === 'email' && !draftRef.current.identity.email) setIdentity({ email: value.trim() });
    },
    [setIdentity],
  );

  const patchAction = useCallback(
    async (a: CardAction, body: { config?: Record<string, unknown>; isActive?: boolean }) => {
      const updated = await api<CardAction>(`/cards/${id}/actions/${a.id}`, { method: 'PATCH', json: body });
      setActions((list) => list.map((x) => (x.id === a.id ? { ...x, ...updated } : x)));
      if (body.config) fillContact(a.type, body.config);
    },
    [id, fillContact],
  );

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const value = useMemo<CardEditor>(() => {
    const live: LiveCard = {
      card: (() => {
        const about = aboutOf(card);
        const text = draft.about.trim();
        const sections = about.section
          ? (card.sections ?? []).map((s) => (s.id === about.section?.id ? { ...s, content: { ...s.content, body: text } } : s))
          : text
            ? [...(card.sections ?? []), { id: 'draft-about', type: 'BIO', order: 0, isVisible: true, content: { body: text } }]
            : (card.sections ?? []);
        return { ...card, templateId: draft.look.templateId, theme: { ...(card.theme ?? {}), ...themeOf(draft.look) }, vcardData: vcardWith(card, draft.identity), sections, actions };
      })(),
    };
    return {
      card,
      draft,
      setIdentity,
      setAbout,
      setLook,
      saveState,
      saveError,
      retry: () => void persist(),
      actions,
      addAction: async (p, config) => {
        const made = await api<CardAction>(`/cards/${id}/actions`, {
          method: 'POST',
          json: { type: p.type, order: actionsRef.current.length, config: { ...initialConfig(p, draftRef.current.identity), ...config } },
        });
        setActions((list) => [...list, made]);
        fillContact(made.type, made.config);
        return made;
      },
      patchAction,
      removeAction: async (a) => {
        await api(`/cards/${id}/actions/${a.id}`, { method: 'DELETE' });
        setActions((list) => list.filter((x) => x.id !== a.id));
      },
      // Up and down within its own group (the quick buttons, or the links), as the card shows them.
      moveAction: async (a, dir) => {
        const list = actionsRef.current;
        const group = list.filter((x) => isQuick(x) === isQuick(a));
        const other = group[group.findIndex((x) => x.id === a.id) + dir];
        if (!other) return;
        const ids = list.map((x) => x.id);
        const i = ids.indexOf(a.id);
        const j = ids.indexOf(other.id);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        setActions(ids.map((x, order) => ({ ...(list.find((y) => y.id === x) as CardAction), order })));
        try {
          await api(`/cards/${id}/actions/reorder`, { method: 'PATCH', json: { ids } });
        } catch (e) {
          setActions(list);
          throw e;
        }
      },
      // A chip opens one button directly: turning it on here turns it off on the others.
      setPrimary: async (a, on) => {
        if (on) {
          for (const other of actionsRef.current.filter((x) => x.id !== a.id && x.config.isPrimary === true)) {
            await patchAction(other, { config: { ...other.config, isPrimary: false } });
          }
        }
        await patchAction(a, { config: { ...a.config, isPrimary: on } });
      },
      setPublished: async (on) => {
        setCard((c) => ({ ...c, isPublished: on }));
        try {
          await api(`/cards/${id}`, { method: 'PATCH', json: { isPublished: on } });
        } catch (e) {
          setCard((c) => ({ ...c, isPublished: !on }));
          throw e;
        }
      },
      saveSlug: async (slug) => {
        try {
          const updated = await api<FullCard>(`/cards/${id}`, { method: 'PATCH', json: { slug } });
          setCard((c) => ({ ...c, slug: updated.slug }));
        } catch (e) {
          throw e instanceof ApiError && e.status === 409 ? new Error('taken') : e;
        }
      },
      live,
    };
  }, [card, draft, actions, saveState, saveError, setIdentity, setAbout, setLook, persist, patchAction, fillContact, id]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
