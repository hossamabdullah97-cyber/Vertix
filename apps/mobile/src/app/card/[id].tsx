import { useCallback, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { LivePreview } from '@/components/LivePreview';
import { Button, Card, Loading, Notice, Row, Screen, Text } from '@/components/ui';
import type { FullCard } from '@/lib/card-editor';
import { useColors } from '@/lib/theme';
import { cardName, cardUrl } from '@/lib/cards';
import { useApi } from '@/lib/use-api';
import { useWorkspaceFromLink } from '@/lib/session';

/** One card: how it looks, editing it, its QR code to show across a table, its link to send, and a chip to program. */
export default function CardScreen() {
  const { id, org } = useLocalSearchParams<{ id: string; org?: string }>();
  const inWorkspace = useWorkspaceFromLink(org);
  const { t } = useTranslation();
  const c = useColors();
  const { data: card, error, loading, reload } = useApi<FullCard>(`/cards/${id}`);
  // Back from the editor, the card is drawn again with what was saved there.
  const [reloads, setReloads] = useState(0);
  const [copied, setCopied] = useState(false);
  // Back from the editor: show what was saved there (the first showing has just loaded it).
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else {
        void reloadRef.current();
        setReloads((n) => n + 1);
      }
    }, []),
  );

  if (!inWorkspace || (loading && !card)) return <Loading />;
  if (!card) return <Notice tone="danger">{error ?? t('card.notFound')}</Notice>;
  const url = cardUrl(card.slug);
  const name = cardName(card);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: name }} />
      {!card.isPublished && <Notice tone="warning">{t('card.unpublished')}</Notice>}
      <Pressable onPress={() => router.push(`/card/edit/${card.id}`)} accessibilityRole="button" accessibilityLabel={t('card.edit')}>
        <LivePreview key={reloads} cardId={card.id} style={{ height: 360, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong }} />
      </Pressable>
      <Row gap={10}>
        <Button label={t('card.edit')} icon="edit" onPress={() => router.push(`/card/edit/${card.id}`)} style={{ flex: 1 }} testID="card-edit" />
        <Button
          label={t('editor.preview')}
          icon="eye"
          kind="secondary"
          onPress={() => router.push({ pathname: '/web', params: { path: `/preview/${card.id}`, title: t('editor.preview') } })}
          style={{ flex: 1 }}
        />
      </Row>
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 22 }}>
        <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: 12 }} testID="card-qr">
          <QRCode value={url} size={200} color="#18181B" backgroundColor="#FFFFFF" ecl="M" />
        </View>
        <Text size="sm" tone="muted" selectable style={{ textAlign: 'center' }}>
          {url.replace(/^https?:\/\//, '')}
        </Text>
        <Text size="xs" tone="faint" style={{ textAlign: 'center' }}>
          {t('card.qrHint')}
        </Text>
      </Card>
      <Row gap={10}>
        <Button label={t('card.share')} icon="share" kind="secondary" onPress={() => void Share.share({ message: url, url })} style={{ flex: 1 }} testID="card-share" />
        <Button
          label={copied ? t('card.copied') : t('card.copy')}
          kind="secondary"
          icon={copied ? 'check' : 'copy'}
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        />
      </Row>
      <Button label={t('chip.program')} kind="secondary" icon="nfc" onPress={() => router.push({ pathname: '/chip', params: { cardId: card.id } })} />
    </Screen>
  );
}
