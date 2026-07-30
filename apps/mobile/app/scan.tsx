import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { resolveTag, type NfcResolution } from '@/lib/api';
import { readTag } from '@/lib/nfc';
import { Button } from '@/components/Button';
import { colors } from '@/lib/theme';

type Status = 'idle' | 'scanning' | 'done' | 'error';

export default function ScanScreen() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<NfcResolution | null>(null);

  async function scan() {
    setStatus('scanning');
    setMessage('Hold a Vertex tag near your phone…');
    setResult(null);
    try {
      const { uid, url } = await readTag();
      if (!uid) throw new Error('Could not read the tag');
      const res = await resolveTag(uid);
      setResult(res);
      setStatus('done');
      setMessage(url ? '' : 'Tag has no URL written yet, but it is registered.');
    } catch (e) {
      setStatus('error');
      setMessage((e as Error).message);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.nfcCircle}>
          <Text style={styles.nfcIcon}>⌁</Text>
        </View>

        {result ? (
          <>
            <Text style={styles.label}>Resolved card</Text>
            <Text style={styles.slug}>/{result.cardSlug || '—'}</Text>
            {result.action && (
              <Text style={styles.action}>
                Primary action: {result.action.type}
              </Text>
            )}
            <View style={{ height: 16 }} />
            <Button
              title="Open"
              onPress={() => Linking.openURL(result.redirectUrl)}
            />
          </>
        ) : (
          status !== 'idle' && (
            <Text
              style={[
                styles.status,
                status === 'error' && { color: colors.danger },
              ]}
            >
              {message}
            </Text>
          )
        )}

        <View style={{ height: 16 }} />
        <Button
          title="Scan a tag"
          variant={result ? 'secondary' : 'primary'}
          onPress={scan}
          loading={status === 'scanning'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center', backgroundColor: colors.canvas },
  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 24, alignItems: 'center' },
  nfcCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  nfcIcon: { fontSize: 44, color: colors.accent },
  label: { fontSize: 13, color: colors.muted },
  slug: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 4 },
  action: { fontSize: 13, color: colors.muted, marginTop: 6 },
  status: { fontSize: 14, textAlign: 'center', color: colors.ink, paddingHorizontal: 8 },
});
