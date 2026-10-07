import { FlatList, RefreshControl, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Divider, Empty, Icon, ListItem, Loading, Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { relative } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useColors } from '@/lib/theme';
import { useApi } from '@/lib/use-api';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  orgId: string | null;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/** The words for the kinds we know, in the reader's language; the stored English for the rest. */
function describe(n: Notif, t: (k: string, o?: Record<string, unknown>) => string) {
  const m = n.metadata ?? {};
  switch (n.type) {
    case 'lead.captured':
      return { title: t(`notifications.types.captured.${str(m.intent) || 'CONTACT'}`), body: n.body ?? '' };
    case 'lead.returned':
      return { title: str(m.name) ? t('notifications.types.returned', { name: str(m.name) }) : t('notifications.types.returnedNoName'), body: str(m.company) };
    case 'lead.follow_up':
      return { title: str(m.name) ? t('notifications.types.followUp', { name: str(m.name) }) : t('notifications.types.followUpNoName'), body: str(m.company) };
    case 'lead.mentioned':
      return { title: t('notifications.types.mentioned', { lead: str(m.leadName) }), body: n.body ?? '' };
    default:
      return { title: n.title, body: n.body ?? '' };
  }
}

const ICON: Record<string, string> = { 'lead.captured': 'user-plus', 'lead.returned': 'eye', 'lead.follow_up': 'clock', 'lead.mentioned': 'message' };

/** What happened for this person, newest first; a tap opens what it is about. */
export default function Notifications() {
  const { t } = useTranslation();
  const c = useColors();
  const { workspace, switchTo, workspaces } = useSession();
  const { data, setData, error, loading, refreshing, reload } = useApi<Notif[]>('/notifications');

  async function open(n: Notif) {
    if (!n.readAt) {
      setData((list) => list?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null);
      void api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => undefined);
    }
    const leadId = str(n.metadata?.leadId);
    if (!leadId) return;
    // About another of their workspaces: opened there.
    if (n.orgId && n.orgId !== workspace?.org.id && workspaces.some((w) => w.org.id === n.orgId)) await switchTo(n.orgId);
    router.push(`/lead/${leadId}`);
  }

  async function readAll() {
    setData((list) => list?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? null);
    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
  }

  const unread = (data ?? []).some((n) => !n.readAt);
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <Stack.Screen options={{ headerRight: () => (unread ? <Button label={t('notifications.readAll')} kind="ghost" small onPress={readAll} /> : null) }} />
      {error && !data ? (
        <Notice tone="danger">{error}</Notice>
      ) : loading && !data ? (
        <Loading />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(n) => n.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.accent} />}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={data?.length ? { backgroundColor: c.surface } : undefined}
          ListEmptyComponent={<Empty icon="bell" title={t('notifications.empty')} body={t('notifications.emptyBody')} />}
          renderItem={({ item: n }) => {
            const d = describe(n, t);
            return (
              <ListItem
                testID="notification"
                title={d.title}
                subtitle={[d.body, relative(n.createdAt)].filter(Boolean).join(' · ')}
                leading={
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: n.readAt ? c.elevated : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={ICON[n.type] ?? 'bell'} size={17} color={n.readAt ? c.muted : c.accentText} />
                  </View>
                }
                trailing={!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : undefined}
                onPress={() => void open(n)}
              />
            );
          }}
        />
      )}
    </View>
  );
}
