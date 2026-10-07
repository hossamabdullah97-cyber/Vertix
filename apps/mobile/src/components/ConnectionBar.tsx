import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { time } from '@/lib/format';
import { dismissFailed, useConnection } from '@/lib/outbox';
import { radius, useColors } from '@/lib/theme';
import { Icon, Text } from './ui';

/**
 * Says when the phone is offline (what shows was saved earlier, what is added
 * waits on the phone), what is waiting to be sent, and what the server refused.
 */
export function ConnectionBar({ savedAt }: { savedAt?: number | null }) {
  const { t } = useTranslation();
  const c = useColors();
  const { online, pending, failed, sending } = useConnection();

  if (failed) {
    return (
      <Pressable accessibilityRole="button" onPress={dismissFailed} testID="connection-failed">
        <Bar bg={c.dangerSoft} fg={c.danger} icon="alert" text={t('offline.failed', { count: failed })} />
      </Pressable>
    );
  }
  if (!online) {
    const saved = savedAt ? ` ${t('offline.savedAt', { time: time(new Date(savedAt)) })}` : '';
    const waiting = pending ? ` ${t('offline.waiting', { count: pending })}` : '';
    return <Bar bg={c.warningSoft} fg={c.warning} icon="wifi-off" text={`${t('offline.title')}${saved}${waiting}`} testID="connection-offline" />;
  }
  if (pending) return <Bar bg={c.elevated} fg={c.muted} icon="clock" text={sending ? t('offline.sending', { count: pending }) : t('offline.waiting', { count: pending })} />;
  return null;
}

function Bar({ bg, fg, icon, text, testID }: { bg: string; fg: string; icon: string; text: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
      <Icon name={icon} size={16} color={fg} />
      <Text size="sm" style={{ color: fg, flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
