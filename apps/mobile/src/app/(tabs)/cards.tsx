import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CardFace } from '@/components/CardFace';
import { Badge, Button, Card, Empty, Loading, Notice, Row, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { identityOf, lookOf, ltr, type FullCard } from '@/lib/card-editor';
import { useColors } from '@/lib/theme';
import { useApi } from '@/lib/use-api';

/**
 * A new card in the open workspace, in its colour and language when it has
 * them (as the website starts one, apps/web/lib/client.ts createBlankCard).
 */
async function createCard(): Promise<FullCard> {
  const theme: Record<string, unknown> = {};
  try {
    const org = await api<{ branding: Record<string, unknown> | null; settings: Record<string, unknown> | null }>('/orgs/current');
    const accent = org.branding?.accent;
    const lang = org.settings?.language;
    if (typeof accent === 'string' && /^#[0-9a-f]{6}$/i.test(accent)) theme.accent = accent;
    if (lang === 'en' || lang === 'ar') theme.lang = lang;
  } catch {
    // A personal workspace has none; defaults never block making a card.
  }
  return api<FullCard>('/cards', { method: 'POST', json: { templateId: 'swiss-blue', ...(Object.keys(theme).length ? { theme } : {}) } });
}

/** The cards the person may use, as they look: open one to share it, edit it, or program a chip. */
export default function Cards() {
  const { t } = useTranslation();
  const c = useColors();
  const { data, error, loading, refreshing, reload } = useApi<FullCard[]>('/cards');
  const [creating, setCreating] = useState(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else void reloadRef.current();
    }, []),
  );

  async function newCard() {
    setCreating(true);
    try {
      const card = await createCard();
      router.push(`/card/edit/${card.id}`);
    } catch (e) {
      // Usually the plan's card limit; the server says which.
      Alert.alert(t('cards.newFailed'), (e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const cards = data ?? [];
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.accent} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text size="xl" weight="bold">
          {t('cards.title')}
        </Text>
        {cards.length > 0 && <Button label={t('cards.new')} icon="plus" small onPress={() => void newCard()} busy={creating} testID="cards-new" />}
      </Row>
      {error && !data ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !data ? (
        <Loading />
      ) : cards.length === 0 ? (
        <Card padded={false}>
          <Empty icon="grid" title={t('cards.empty')} body={t('cards.emptyBody')} action={<Button label={t('cards.newFirst')} icon="plus" onPress={() => void newCard()} busy={creating} testID="cards-new" />} />
        </Card>
      ) : (
        cards.map((card) => (
          <Pressable key={card.id} testID="card-row" accessibilityRole="button" onPress={() => router.push(`/card/${card.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, gap: 8 })}>
            <CardFace id={card.id} look={lookOf(card)} identity={identityOf(card)} fallbackName={t('editor.yourName')} />
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
              <Text size="sm" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                {ltr(`/c/${card.slug}`)}
              </Text>
              {card.isPublished ? <Badge label={t('cards.live')} tone="success" /> : <Badge label={t('cards.draft')} tone="warning" />}
            </Row>
          </Pressable>
        ))
      )}
      <View style={{ gap: 10 }}>
        <Button label={t('chip.read')} kind="secondary" icon="nfc" onPress={() => router.push('/chip')} />
      </View>
    </Screen>
  );
}
