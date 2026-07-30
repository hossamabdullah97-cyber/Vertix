import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { listCards, clearToken, type Card } from '@/lib/api';
import { Button } from '@/components/Button';
import { colors } from '@/lib/theme';

export default function CardsScreen() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      listCards()
        .then(setCards)
        .catch((e) => setError(e.message));
    }, []),
  );

  async function signOut() {
    await clearToken();
    router.replace('/login');
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Button title="Scan a tag" onPress={() => router.push('/scan')} />
        <View style={{ height: 10 }} />
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </View>

      <Text style={styles.heading}>Tap a card to program a tag</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.muted}>No cards yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({ pathname: '/write', params: { cardId: item.id, slug: item.slug } })
            }
          >
            <View>
              <Text style={styles.slug}>/{item.slug}</Text>
              <Text style={styles.muted}>{item.templateId}</Text>
            </View>
            <View style={[styles.badge, item.isPublished ? styles.pub : styles.draft]}>
              <Text style={[styles.badgeText, item.isPublished && { color: colors.success }]}>
                {item.isPublished ? 'Published' : 'Draft'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.canvas },
  toolbar: { marginBottom: 16 },
  heading: { fontSize: 13, color: colors.muted, marginBottom: 10 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slug: { fontSize: 16, fontWeight: '600', color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pub: { backgroundColor: '#dcfce7' },
  draft: { backgroundColor: colors.canvas },
  badgeText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginBottom: 10 },
});
