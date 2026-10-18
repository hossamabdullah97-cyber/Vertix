import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CardFace } from '@/components/CardFace';
import { DesignTab } from '@/components/card-editor/DesignTab';
import { LinksTab, type LinkOps } from '@/components/card-editor/LinksTab';
import { ProfileTab } from '@/components/card-editor/ProfileTab';
import { SettingsTab } from '@/components/card-editor/SettingsTab';
import { Button, Loading, Notice, Row, Segmented, Text } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  aboutOf,
  identityOf,
  initialConfig,
  isQuick,
  lookOf,
  slugProblem,
  themeOf,
  vcardWith,
  type CardAction,
  type FullCard,
  type Identity,
  type Look,
} from '@/lib/card-editor';
import { useWorkspaceFromLink } from '@/lib/session';
import { fonts, useColors } from '@/lib/theme';
import { useApi } from '@/lib/use-api';

type Tab = 'profile' | 'links' | 'design' | 'settings';
const TABS: Tab[] = ['profile', 'links', 'design', 'settings'];

/** What the editor holds until it is saved: who, the About, the look and the address. */
interface Draft {
  identity: Identity;
  about: string;
  look: Look;
  slug: string;
}

const draftOf = (card: FullCard): Draft => ({ identity: identityOf(card), about: aboutOf(card).text, look: lookOf(card), slug: card.slug });
const same = (a: Draft | null, b: Draft | null) => JSON.stringify(a) === JSON.stringify(b);
const byOrder = (list: CardAction[] = []) => [...list].sort((a, b) => a.order - b.order);

/**
 * A card made on the phone, as on the website's Studio: who is on it, its
 * buttons, its look, and whether it is live. Buttons are saved as they change;
 * the rest waits for Save, so a half-typed name never reaches the live card.
 */
export default function EditCard() {
  const { id, org, tab: firstTab } = useLocalSearchParams<{ id: string; org?: string; tab?: Tab }>();
  const inWorkspace = useWorkspaceFromLink(org);
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const card = useApi<FullCard>(`/cards/${id}`);
  const [tab, setTab] = useState<Tab>(TABS.includes(firstTab as Tab) ? (firstTab as Tab) : 'profile');
  const [draft, setDraft] = useState<Draft | null>(null);
  const savedRef = useRef<Draft | null>(null);
  const [actions, setActions] = useState<CardAction[]>([]);
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const leaving = useRef(false);

  // The server's card becomes the editor's, unless something is being edited.
  const forceApply = useRef(false);
  useEffect(() => {
    const d = card.data;
    if (!d) return;
    const fresh = draftOf(d);
    // Read now: the updater may run later, after both refs have moved on.
    const force = forceApply.current;
    const before = savedRef.current;
    setDraft((cur) => (force || !cur || same(cur, before) ? fresh : cur));
    savedRef.current = fresh;
    forceApply.current = false;
    setActions(byOrder(d.actions));
    setPublished(d.isPublished);
  }, [card.data]);

  const dirty = !!draft && !same(draft, savedRef.current);

  async function save(): Promise<boolean> {
    const base = card.data;
    if (!draft || !base) return false;
    if (slugProblem(draft.slug)) {
      setTab('settings');
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { vcardData: vcardWith(base, draft.identity), theme: themeOf(draft.look), templateId: draft.look.templateId };
      if (draft.slug !== base.slug) body.slug = draft.slug;
      await api(`/cards/${id}`, { method: 'PATCH', json: body });
      const about = aboutOf(base);
      const text = draft.about.trim();
      if (text !== about.text.trim()) {
        if (about.section) {
          await api(`/cards/${id}/sections/${about.section.id}`, { method: 'PATCH', json: { content: { ...about.section.content, body: text } } });
        } else if (text) {
          await api(`/cards/${id}/sections`, { method: 'POST', json: { type: 'BIO', content: { body: text } } });
        }
      }
      forceApply.current = true;
      await card.reload();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? t('editor.slugTaken') : (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Leaving with changes not saved asks first (the swipe back is off meanwhile, as it cannot ask).
  useEffect(() => {
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (leaving.current) return;
      e.preventDefault();
      Alert.alert(t('editor.unsavedTitle'), t('editor.unsavedBody'), [
        { text: t('editor.keepEditing'), style: 'cancel' },
        { text: t('editor.discard'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        { text: t('editor.save'), onPress: () => void save().then((ok) => ok && navigation.dispatch(e.data.action)) },
      ]);
    });
  });

  // ---- buttons: each change goes to the server at once, as on the website
  const patchAction = async (a: CardAction, body: { config?: Record<string, unknown>; isActive?: boolean }) => {
    const updated = await api<CardAction>(`/cards/${id}/actions/${a.id}`, { method: 'PATCH', json: body });
    setActions((list) => list.map((x) => (x.id === a.id ? { ...x, ...updated } : x)));
  };
  const ops: LinkOps = {
    add: async (p) => {
      const made = await api<CardAction>(`/cards/${id}/actions`, {
        method: 'POST',
        json: { type: p.type, order: actions.length, config: initialConfig(p, draft?.identity ?? { phone: '', email: '' }) },
      });
      setActions((list) => [...list, made]);
      return made;
    },
    patch: patchAction,
    remove: async (a) => {
      await api(`/cards/${id}/actions/${a.id}`, { method: 'DELETE' });
      setActions((list) => list.filter((x) => x.id !== a.id));
    },
    // Up and down within its own group (the quick row, or the links), as the card shows them.
    move: async (a, dir) => {
      const group = actions.filter((x) => isQuick(x) === isQuick(a));
      const other = group[group.findIndex((x) => x.id === a.id) + dir];
      if (!other) return;
      const ids = actions.map((x) => x.id);
      const i = ids.indexOf(a.id);
      const j = ids.indexOf(other.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const before = actions;
      setActions(ids.map((x, order) => ({ ...(actions.find((y) => y.id === x) as CardAction), order })));
      try {
        await api(`/cards/${id}/actions/reorder`, { method: 'PATCH', json: { ids } });
      } catch (e) {
        setActions(before);
        throw e;
      }
    },
    // A chip opens one button directly: turning it on here turns it off on the others.
    setPrimary: async (a, on) => {
      if (on) {
        for (const other of actions.filter((x) => x.id !== a.id && x.config.isPrimary === true)) {
          await patchAction(other, { config: { ...other.config, isPrimary: false } });
        }
      }
      await patchAction(a, { config: { ...a.config, isPrimary: on } });
    },
  };

  async function publish(on: boolean) {
    setPublishing(true);
    setPublished(on);
    setError(null);
    try {
      await api(`/cards/${id}`, { method: 'PATCH', json: { isPublished: on } });
    } catch (e) {
      setPublished(!on);
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  async function openWeb(path: string, title?: string) {
    if (dirty && !(await save())) return;
    router.push({ pathname: '/web', params: { path, ...(title ? { title } : {}) } });
  }

  function remove() {
    const name = draft?.identity.fullName || card.data?.slug || '';
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('editor.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/cards/${id}`, { method: 'DELETE' });
            leaving.current = true;
            router.dismissTo('/cards');
          } catch (e) {
            setError((e as Error).message);
          }
        },
      },
    ]);
  }

  if (!inWorkspace || (card.loading && !card.data)) return <Loading />;
  if (!card.data || !draft) return <Notice tone="danger">{card.error ?? t('card.notFound')}</Notice>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.canvas }} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen
        options={{
          title: t('editor.title'),
          gestureEnabled: !dirty,
          headerRight: () => (
            <Pressable onPress={() => void openWeb(`/cards/${id}/preview`, t('editor.preview'))} accessibilityRole="button" hitSlop={10} testID="editor-preview">
              <Text tone="accent" weight="semibold">
                {t('editor.preview')}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: dirty ? 120 : 40 }} keyboardShouldPersistTaps="handled">
        <CardFace id={card.data.id} size="hero" look={draft.look} identity={draft.identity} fallbackName={t('editor.yourName')} />
        <Segmented value={tab} onChange={setTab} options={TABS.map((v) => ({ value: v, label: t(`editor.tabs.${v}`) }))} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {savedFlash && !dirty ? <Notice tone="success">{t('editor.saved')}</Notice> : null}
        {tab === 'profile' && (
          <ProfileTab
            identity={draft.identity}
            about={draft.about}
            onIdentity={(identity) => setDraft((d) => (d ? { ...d, identity } : d))}
            onAbout={(about) => setDraft((d) => (d ? { ...d, about } : d))}
          />
        )}
        {tab === 'links' && <LinksTab actions={actions} ops={ops} />}
        {tab === 'design' && <DesignTab look={draft.look} onLook={(look) => setDraft((d) => (d ? { ...d, look } : d))} />}
        {tab === 'settings' && (
          <SettingsTab
            published={published}
            publishing={publishing}
            onPublished={(on) => void publish(on)}
            slug={draft.slug}
            onSlug={(slug) => setDraft((d) => (d ? { ...d, slug } : d))}
            onWebsite={() => void openWeb(`/cards/${id}`)}
            onDelete={remove}
          />
        )}
      </ScrollView>
      {dirty && (
        <View
          style={{
            position: 'absolute',
            start: 0,
            end: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: c.surface,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.lineStrong,
          }}
        >
          <Row gap={10}>
            <Text size="sm" tone="muted" style={{ flex: 1, fontFamily: fonts.medium }}>
              {t('editor.unsaved')}
            </Text>
            <Button label={t('editor.discard')} kind="ghost" small onPress={() => setDraft(savedRef.current)} disabled={saving} />
            <Button label={t('editor.save')} icon="check" small onPress={() => void save()} busy={saving} testID="editor-save" />
          </Row>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
