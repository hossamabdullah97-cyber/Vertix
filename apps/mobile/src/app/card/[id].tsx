import { useState } from 'react';
import { Share, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { Button, Card, Loading, Notice, Screen, Text } from '@/components/ui';
import { cardName, cardUrl, type CardRow } from '@/lib/cards';
import { useApi } from '@/lib/use-api';
import { useWorkspaceFromLink } from '@/lib/session';

/** One card: its QR code to show across a table, its link to send, and a chip to program. */
export default function CardScreen() {
  const { id, org } = useLocalSearchParams<{ id: string; org?: string }>();
  const inWorkspace = useWorkspaceFromLink(org);
  const { t } = useTranslation();
  const { data: card, error, loading } = useApi<CardRow>(`/cards/${id}`);
  const [copied, setCopied] = useState(false);

  if (!inWorkspace || (loading && !card)) return <Loading />;
  if (!card) return <Notice tone="danger">{error ?? t('card.notFound')}</Notice>;
  const url = cardUrl(card.slug);
  const name = cardName(card);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: name }} />
      {!card.isPublished && <Notice tone="warning">{t('card.unpublished')}</Notice>}
      <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
        <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: 12 }} testID="card-qr">
          <QRCode value={url} size={220} color="#18181B" backgroundColor="#FFFFFF" ecl="M" />
        </View>
        <Text weight="semibold" style={{ textAlign: 'center' }}>
          {name}
        </Text>
        <Text size="sm" tone="muted" selectable style={{ textAlign: 'center' }}>
          {url.replace(/^https?:\/\//, '')}
        </Text>
        <Text size="xs" tone="faint" style={{ textAlign: 'center' }}>
          {t('card.qrHint')}
        </Text>
      </Card>
      <Button label={t('card.share')} icon="share" onPress={() => void Share.share({ message: url, url })} testID="card-share" />
      <Button
        label={copied ? t('card.copied') : t('card.copy')}
        kind="secondary"
        icon={copied ? 'check' : 'copy'}
        onPress={async () => {
          await Clipboard.setStringAsync(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
      />
      <Button label={t('chip.program')} kind="secondary" icon="wifi-off" onPress={() => router.push({ pathname: '/chip', params: { cardId: card.id } })} />
      <Button label={t('card.editOnWeb')} kind="ghost" icon="external-link" onPress={() => router.push({ pathname: '/web', params: { path: `/cards/${card.id}` } })} />
    </Screen>
  );
}
