import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, Divider, Empty, ListItem, Loading, Notice, Screen, Text } from '@/components/ui';
import { cardName, type CardRow } from '@/lib/cards';
import { useColors } from '@/lib/theme';
import { useApi } from '@/lib/use-api';

/** The cards the person may use: share one, or program a chip with it. */
export default function Cards() {
  const { t } = useTranslation();
  const c = useColors();
  const { data, error, loading, refreshing, reload } = useApi<CardRow[]>('/cards');

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.accent} />}>
      <Text size="xl" weight="bold">
        {t('cards.title')}
      </Text>
      {error && !data ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !data ? (
        <Loading />
      ) : (
        <Card padded={false}>
          {(data ?? []).length === 0 ? (
            <Empty icon="grid" title={t('cards.empty')} body={t('cards.emptyBody')} />
          ) : (
            (data ?? []).map((card, i) => (
              <View key={card.id}>
                {i > 0 && <Divider />}
                <ListItem
                  testID="card-row"
                  title={cardName(card)}
                  subtitle={`/c/${card.slug}`}
                  leading={<Avatar name={cardName(card)} size={40} />}
                  trailing={card.isPublished ? undefined : <Badge label={t('cards.draft')} tone="warning" />}
                  onPress={() => router.push(`/card/${card.id}`)}
                />
              </View>
            ))
          )}
        </Card>
      )}
      <Button label={t('chip.read')} kind="secondary" icon="wifi-off" onPress={() => router.push('/chip')} />
      <Button label={t('cards.newOnWeb')} kind="ghost" icon="plus" onPress={() => router.push({ pathname: '/web', params: { path: '/cards' } })} />
    </Screen>
  );
}
