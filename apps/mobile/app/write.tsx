import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { API_BASE, registerAndAssign } from '@/lib/api';
import { programTag } from '@/lib/nfc';
import { Button } from '@/components/Button';
import { colors } from '@/lib/theme';

type Status = 'idle' | 'writing' | 'done' | 'error';

export default function WriteScreen() {
  const { cardId, slug } = useLocalSearchParams<{ cardId: string; slug: string }>();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function program() {
    setStatus('writing');
    setMessage(
      Platform.OS === 'ios'
        ? 'Hold your iPhone near the tag…'
        : 'Hold the tag against the back of your phone…',
    );
    try {
      // One tap: read the UID and write the gateway URL to the tag.
      const uid = await programTag((u) => `${API_BASE}/t/${u}`);
      // Register the tag for the org and link it to this card.
      await registerAndAssign(uid, cardId);
      setStatus('done');
      setMessage(`Done! Tapping this tag now opens /${slug}.`);
    } catch (e) {
      setStatus('error');
      setMessage((e as Error).message);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Programming tag for</Text>
        <Text style={styles.slug}>/{slug}</Text>

        <View style={styles.nfcCircle}>
          <Text style={styles.nfcIcon}>⌁</Text>
        </View>

        {status !== 'idle' && (
          <Text
            style={[
              styles.status,
              status === 'done' && { color: colors.success },
              status === 'error' && { color: colors.danger },
            ]}
          >
            {message}
          </Text>
        )}

        <View style={{ height: 16 }} />
        <Button
          title={status === 'done' ? 'Program another tag' : 'Hold a tag to program'}
          onPress={program}
          loading={status === 'writing'}
        />
      </View>

      <Text style={styles.hint}>
        The tag&apos;s URL points to the secure gateway, which records the scan and
        routes the visitor to your card or primary action.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.canvas },
  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 24, alignItems: 'center' },
  label: { fontSize: 13, color: colors.muted },
  slug: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 4 },
  nfcCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', marginVertical: 24 },
  nfcIcon: { fontSize: 44, color: colors.accent },
  status: { fontSize: 14, textAlign: 'center', color: colors.ink, paddingHorizontal: 8 },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 20, paddingHorizontal: 16, lineHeight: 18 },
});
