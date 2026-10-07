import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { unlock } from '@/lib/lock';
import { radius, useColors } from '@/lib/theme';
import { Button, Text } from './ui';

/** Over everything while the app is locked; asks for the face or finger at once. */
export function LockScreen({ onUnlocked, onSignOut }: { onUnlocked: () => void; onSignOut: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    try {
      if (await unlock(t('lock.prompt'))) onUnlocked();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void ask();
    // Once, as the lock shows.
  }, []);

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, zIndex: 100 }} testID="lock-screen">
      <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text size="xxl" tone="onAccent" weight="bold">
          V
        </Text>
      </View>
      <Text size="lg" weight="semibold">
        {t('lock.title')}
      </Text>
      <Button label={t('lock.unlock')} icon="lock" onPress={ask} busy={busy} style={{ alignSelf: 'stretch' }} />
      <Button label={t('more.signOut')} kind="ghost" onPress={onSignOut} />
    </View>
  );
}
