import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DesignSheet } from '@/components/card-editor/DesignSheet';
import { BrandBubble, LinksSheet } from '@/components/card-editor/LinksSheet';
import { ProfileSheet } from '@/components/card-editor/ProfileSheet';
import { SettingsSheet } from '@/components/card-editor/SettingsSheet';
import { LivePreview } from '@/components/LivePreview';
import { Card, Divider, Forward, Icon, Loading, Notice, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { CardEditorProvider, useCardEditor } from '@/lib/card-draft';
import { brandOf, isDraft, ltr, TEMPLATES, type FullCard } from '@/lib/card-editor';
import { useWorkspaceFromLink } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';

type Section = 'profile' | 'links' | 'design' | 'settings';
const SECTIONS: { key: Section; icon: string }[] = [
  { key: 'profile', icon: 'user' },
  { key: 'links', icon: 'link' },
  { key: 'design', icon: 'palette' },
  { key: 'settings', icon: 'settings' },
];

/** How saving stands: kept, on its way, or refused (with another try). */
function SaveState() {
  const { t } = useTranslation();
  const c = useColors();
  const { saveState, saveError, retry } = useCardEditor();
  if (saveState === 'error') {
    return (
      <Pressable onPress={retry} accessibilityRole="button" testID="save-retry">
        <Notice tone="danger">{t('editor.saveFailed', { reason: saveError ?? '' })}</Notice>
      </Pressable>
    );
  }
  return (
    <Row gap={6} style={{ justifyContent: 'center' }}>
      <Icon name={saveState === 'saving' ? 'loader' : 'check'} size={15} color={saveState === 'saving' ? c.faint : c.success} />
      <Text size="xs" tone={saveState === 'saving' ? 'faint' : 'success'} testID="save-state">
        {saveState === 'saving' ? t('editor.saving') : t('editor.allSaved')}
      </Text>
    </Row>
  );
}

/** The card as visitors see it, full height and scrollable, links not followed. */
function FullPreview({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const { card, live } = useCardEditor();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.canvas }}>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
          <View style={{ flex: 1 }}>
            <Text size="lg" weight="semibold">
              {t('editor.preview')}
            </Text>
            <Text size="xs" tone="faint">
              {t('editor.previewHint')}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={12} style={{ padding: 4 }}>
            <Icon name="x" size={22} color={c.muted} />
          </Pressable>
        </Row>
        {visible ? <LivePreview cardId={card.id} live={live} interactive style={{ flex: 1 }} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

/**
 * The card editor's front page: the card as visitors see it (following every
 * change), how complete it is and what to do next, and the four parts it is
 * made of, each opened on its own page.
 */
function Editor({ first }: { first: Section | null }) {
  const { t } = useTranslation();
  const c = useColors();
  const { card, draft, actions, live } = useCardEditor();
  const [open, setOpen] = useState<Section | null>(first);
  const [full, setFull] = useState(false);
  const { identity, look } = draft;

  // How complete the card is: the five things a good card has, and the first one missing.
  const checks: { key: string; done: boolean; section: Section }[] = [
    { key: 'name', done: !!identity.fullName.trim(), section: 'profile' },
    { key: 'photo', done: !!identity.avatar, section: 'profile' },
    { key: 'title', done: !!(identity.title.trim() || identity.company.trim()), section: 'profile' },
    { key: 'contact', done: actions.some((a) => a.isActive && !isDraft(a) && ['CALL', 'WHATSAPP', 'EMAIL'].includes(a.type)), section: 'links' },
    { key: 'about', done: !!draft.about.trim(), section: 'profile' },
  ];
  const score = Math.round((checks.filter((x) => x.done).length / checks.length) * 100);
  const next = checks.find((x) => !x.done);
  const template = TEMPLATES.find((x) => x.id === look.templateId);

  const summary: Record<Section, string> = {
    profile: [identity.fullName.trim(), identity.title.trim()].filter(Boolean).join(' · ') || t('editor.summary.profileEmpty'),
    links: actions.length ? t('editor.summary.links', { count: actions.length }) : t('editor.summary.linksEmpty'),
    design: `${template?.name ?? t('editor.summary.custom')} · ${t(`editor.modes.${look.mode}`)}`,
    settings: `${t(card.isPublished ? 'editor.summary.live' : 'editor.summary.draft')} · ${ltr(`/c/${card.slug}`)}`,
  };

  function remove() {
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteConfirm', { name: identity.fullName || card.slug }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('editor.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/cards/${card.id}`, { method: 'DELETE' });
            setOpen(null);
            router.dismissTo('/cards');
          } catch (e) {
            Alert.alert(t('editor.deleteFailed'), (e as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('editor.title'),
          headerRight: () => (
            <Pressable onPress={() => setFull(true)} accessibilityRole="button" hitSlop={10} testID="editor-preview">
              <Text tone="accent" weight="semibold">
                {t('editor.preview')}
              </Text>
            </Pressable>
          ),
        }}
      />
      <Screen edges={[]}>
        <Pressable onPress={() => setFull(true)} accessibilityRole="button" accessibilityLabel={t('editor.preview')} testID="editor-card">
          <LivePreview
            cardId={card.id}
            live={live}
            style={{ height: 400, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong }}
          />
          <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Icon name="eye" size={15} color="#FFFFFF" />
            <Text size="xs" weight="semibold" style={{ color: '#FFFFFF' }}>
              {t('editor.seeFull')}
            </Text>
          </View>
        </Pressable>
        <SaveState />

        <Card>
          <View style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text weight="semibold">{t('editor.strength')}</Text>
              <Text weight="bold" tone={score === 100 ? 'success' : 'accent'} testID="editor-score">
                {score}%
              </Text>
            </Row>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.elevated, overflow: 'hidden' }}>
              <View style={{ width: `${score}%`, height: '100%', borderRadius: 4, backgroundColor: score === 100 ? c.success : c.accent }} />
            </View>
            {next ? (
              <Pressable onPress={() => setOpen(next.section)} accessibilityRole="button" testID="editor-next">
                <Row gap={8}>
                  <Icon name="sparkle" size={16} color={c.accentText} />
                  <Text size="sm" tone="accent" weight="medium" style={{ flex: 1 }}>
                    {t(`editor.next.${next.key}`)}
                  </Text>
                  <Forward color={c.accentText} />
                </Row>
              </Pressable>
            ) : (
              <Text size="sm" tone="success">
                {t('editor.complete')}
              </Text>
            )}
          </View>
        </Card>

        <View style={{ gap: 8 }}>
          <SectionTitle>{t('editor.partsTitle')}</SectionTitle>
          <Card padded={false}>
            {SECTIONS.map((s, i) => (
              <View key={s.key}>
                {i > 0 && <Divider />}
                <Pressable
                  onPress={() => setOpen(s.key)}
                  accessibilityRole="button"
                  testID={`section-${s.key}`}
                  style={({ pressed }) => ({ backgroundColor: pressed ? c.elevated : 'transparent' })}
                >
                  <Row gap={14} style={{ paddingHorizontal: 16, paddingVertical: 14, minHeight: 72 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={s.icon} size={21} color={c.accentText} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text weight="semibold">{t(`editor.sections.${s.key}`)}</Text>
                      <Text size="sm" tone="muted" numberOfLines={1}>
                        {summary[s.key]}
                      </Text>
                      {s.key === 'links' && actions.length > 0 ? (
                        <Row gap={4} style={{ marginTop: 4 }}>
                          {actions.slice(0, 6).map((a) => (
                            <BrandBubble key={a.id} brand={brandOf(a)} size={20} />
                          ))}
                        </Row>
                      ) : null}
                    </View>
                    <Forward color={c.faint} />
                  </Row>
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      </Screen>

      <ProfileSheet visible={open === 'profile'} onClose={() => setOpen(null)} />
      <LinksSheet visible={open === 'links'} onClose={() => setOpen(null)} />
      <DesignSheet visible={open === 'design'} onClose={() => setOpen(null)} />
      <SettingsSheet
        visible={open === 'settings'}
        onClose={() => setOpen(null)}
        onWebsite={() => {
          setOpen(null);
          router.push({ pathname: '/web', params: { path: `/cards/${card.id}` } });
        }}
        onDelete={remove}
      />
      <FullPreview visible={full} onClose={() => setFull(false)} />
    </>
  );
}

/** A card made on the phone, as on the website's Studio, in clear parts; every change is kept as it is made. */
export default function EditCard() {
  const { id, org, open } = useLocalSearchParams<{ id: string; org?: string; open?: Section }>();
  const inWorkspace = useWorkspaceFromLink(org);
  const { t } = useTranslation();
  const [card, setCard] = useState<FullCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The server's copy, fresh: an editor never starts from what was kept offline.
  useEffect(() => {
    if (!inWorkspace) return;
    api<FullCard>(`/cards/${id}`)
      .then(setCard)
      .catch((e: Error) => setError(e.message));
  }, [id, inWorkspace]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!inWorkspace || !card) return <Loading />;
  return (
    <CardEditorProvider initial={card}>
      <Editor first={SECTIONS.some((s) => s.key === open) ? (open as Section) : null} />
    </CardEditorProvider>
  );
}
