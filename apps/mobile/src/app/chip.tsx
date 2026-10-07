import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Icon, Notice, Screen, Text } from '@/components/ui';
import { registerAndAssign, resolveTag, tapUrl, type Resolution } from '@/lib/chips';
import { cancelNfc, nfcSupported, programTag, readTag } from '@/lib/nfc';
import { useColors } from '@/lib/theme';

type State = { kind: 'idle' } | { kind: 'waiting' } | { kind: 'programmed' } | { kind: 'read'; result: Resolution | null; url: string | null } | { kind: 'error'; message: string };

/** Programs a chip with a card (from a card's page), or reads which card a chip opens. */
export default function Chip() {
  const { cardId } = useLocalSearchParams<{ cardId?: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const programming = !!cardId;

  useEffect(() => {
    void nfcSupported().then(setSupported);
    return () => void cancelNfc();
  }, []);

  const say = (e: unknown) => {
    const m = (e as Error).message;
    return m === 'NFC_UNSUPPORTED' ? t('chip.unsupported') : m === 'CHIP_NOT_FOUND' ? t('chip.notRegistered') : m.startsWith('NFC_') ? t('chip.failed') : m;
  };

  async function program() {
    setState({ kind: 'waiting' });
    try {
      const uid = await programTag(tapUrl);
      await registerAndAssign(uid, cardId!);
      setState({ kind: 'programmed' });
    } catch (e) {
      setState({ kind: 'error', message: say(e) });
    }
  }

  async function read() {
    setState({ kind: 'waiting' });
    try {
      const { uid, url } = await readTag();
      const result = uid ? await resolveTag(uid).catch(() => null) : null;
      setState({ kind: 'read', result, url });
    } catch (e) {
      setState({ kind: 'error', message: say(e) });
    }
  }

  return (
    <Screen edges={[]}>
      <Card style={{ alignItems: 'center', gap: 16, paddingVertical: 28 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: state.kind === 'waiting' ? c.accentSoft : c.elevated, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={state.kind === 'programmed' ? 'check' : 'wifi-off'} size={40} color={state.kind === 'programmed' ? c.success : c.accentText} />
        </View>
        <Text size="lg" weight="semibold" style={{ textAlign: 'center' }}>
          {programming ? t('chip.programTitle') : t('chip.readTitle')}
        </Text>
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {state.kind === 'waiting'
            ? Platform.OS === 'ios'
              ? t('chip.holdIphone')
              : t('chip.holdAndroid')
            : state.kind === 'programmed'
              ? t('chip.programmed')
              : programming
                ? t('chip.programBody')
                : t('chip.readBody')}
        </Text>
      </Card>

      {supported === false && <Notice tone="warning">{t('chip.unsupported')}</Notice>}
      {state.kind === 'error' && <Notice tone="danger">{state.message}</Notice>}
      {state.kind === 'read' &&
        (state.result ? (
          <Card style={{ gap: 10 }}>
            <Text weight="semibold">{t('chip.opens', { card: `/c/${state.result.cardSlug}` })}</Text>
            <Button label={t('chip.openIt')} kind="secondary" icon="external-link" onPress={() => void Linking.openURL(state.result!.redirectUrl)} />
          </Card>
        ) : (
          <Notice tone="warning">{state.url ? t('chip.foreign', { url: state.url }) : t('chip.blank')}</Notice>
        ))}

      <Button
        label={state.kind === 'programmed' ? t('chip.programAnother') : programming ? t('chip.programNow') : t('chip.readNow')}
        icon="wifi-off"
        onPress={programming ? program : read}
        busy={state.kind === 'waiting'}
        disabled={supported === false}
        testID="chip-go"
      />
      <Text size="xs" tone="faint" style={{ textAlign: 'center' }}>
        {t('chip.hint')}
      </Text>
    </Screen>
  );
}
