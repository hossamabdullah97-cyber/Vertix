import { useMemo } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Card, Divider, Empty, Icon, ListItem, Loading, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { awaitsReply, returnedAt, waitingHours, type Lead, type Task } from '@/lib/crm';
import { date, relative } from '@/lib/format';
import { useSession } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';
import { useApi } from '@/lib/use-api';

const DAY = 86_400_000;

/** What needs doing today: who waits for a reply, who came back to a card, which tasks are due. */
export default function Home() {
  const { t } = useTranslation();
  const c = useColors();
  const { me, workspace, workspaces } = useSession();
  const leads = useApi<Lead[]>('/leads');
  const tasks = useApi<Task[]>('/tasks');
  const unread = useApi<{ count: number; byWorkspace: Record<string, number> }>('/notifications/unread-count');

  const now = Date.now();
  const view = useMemo(() => {
    const list = leads.data ?? [];
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    return {
      waiting: list.filter((l) => awaitsReply(l, now)),
      back: list.filter((l) => returnedAt(l, now)),
      week: list.filter((l) => now - new Date(l.createdAt).getTime() < 7 * DAY).length,
      due: (tasks.data ?? []).filter((x) => !x.completed && x.dueDate && new Date(x.dueDate).getTime() <= endOfDay.getTime()),
    };
  }, [leads.data, tasks.data, now]);

  const reload = () => {
    void leads.reload();
    void tasks.reload();
    void unread.reload();
  };
  const first = (me?.name ?? me?.email ?? '').split(/[\s@]/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('home.morning', { name: first }) : hour < 18 ? t('home.afternoon', { name: first }) : t('home.evening', { name: first });

  return (
    <Screen refreshControl={<RefreshControl refreshing={leads.refreshing} onRefresh={reload} tintColor={c.accent} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" onPress={() => workspaces.length > 1 && router.push('/workspaces')} style={{ flexShrink: 1 }} testID="workspace-switch">
          <Row gap={6}>
            <Text size="sm" tone="muted" weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
              {workspace?.org.kind === 'PERSONAL' ? t('workspaces.personal') : workspace?.org.name}
            </Text>
            {workspaces.length > 1 && <Icon name="chevron-down" size={14} color={c.muted} />}
          </Row>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.title')} onPress={() => router.push('/notifications')} style={{ padding: 6 }} testID="open-notifications">
          <Icon name="bell" size={22} />
          {!!unread.data?.count && (
            <View style={{ position: 'absolute', top: 2, end: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text size="xs" tone="onAccent" weight="semibold" style={{ fontSize: 10, lineHeight: 14 }}>
                {unread.data.count > 99 ? '99+' : unread.data.count}
              </Text>
            </View>
          )}
        </Pressable>
      </Row>

      <Text size="xl" weight="bold" testID="home-greeting">
        {greeting}
      </Text>

      {leads.loading && !leads.data ? (
        <Loading />
      ) : (
        <>
          <Row gap={10}>
            <Stat label={t('home.waiting')} value={view.waiting.length} tone={view.waiting.length ? 'warning' : 'ink'} onPress={() => router.push({ pathname: '/leads', params: { filter: 'waiting' } })} />
            <Stat label={t('home.back')} value={view.back.length} tone={view.back.length ? 'accent' : 'ink'} onPress={() => router.push({ pathname: '/leads', params: { filter: 'back' } })} />
            <Stat label={t('home.thisWeek')} value={view.week} onPress={() => router.push('/leads')} />
          </Row>

          {view.back.length > 0 && (
            <View style={{ gap: 8 }}>
              <SectionTitle>{t('home.backTitle')}</SectionTitle>
              <Card padded={false}>
                {view.back.slice(0, 3).map((l, i) => (
                  <View key={l.id}>
                    {i > 0 && <Divider />}
                    <ListItem
                      title={l.name || l.email || t('leads.unknown')}
                      subtitle={t('home.backOn', { when: relative(returnedAt(l)!) })}
                      leading={<Avatar name={l.name || l.email} size={36} />}
                      trailing={<Icon name="eye" size={18} color={c.accentText} />}
                      onPress={() => router.push(`/lead/${l.id}`)}
                    />
                  </View>
                ))}
              </Card>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <SectionTitle>{t('home.waitingTitle')}</SectionTitle>
            <Card padded={false}>
              {view.waiting.length === 0 ? (
                <Empty icon="check" title={t('home.noneWaiting')} body={t('home.noneWaitingBody')} />
              ) : (
                view.waiting.slice(0, 5).map((l, i) => (
                  <View key={l.id}>
                    {i > 0 && <Divider />}
                    <ListItem
                      testID="home-waiting-lead"
                      title={l.name || l.email || t('leads.unknown')}
                      subtitle={[l.company, t('leads.waitingFor', { count: Math.floor((waitingHours(l) ?? 0) / 24) })].filter(Boolean).join(' · ')}
                      leading={<Avatar name={l.name || l.email} size={36} />}
                      onPress={() => router.push(`/lead/${l.id}`)}
                    />
                  </View>
                ))
              )}
            </Card>
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle>{t('home.dueTitle')}</SectionTitle>
            <Card padded={false}>
              {view.due.length === 0 ? (
                <Empty icon="calendar" title={t('home.noneDue')} />
              ) : (
                view.due.slice(0, 5).map((task, i) => {
                  const late = new Date(task.dueDate!).getTime() < Date.now();
                  return (
                    <View key={task.id}>
                      {i > 0 && <Divider />}
                      <ListItem
                        title={task.title}
                        subtitle={[task.lead?.name, date(task.dueDate!, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')}
                        leading={<Icon name="check" size={20} color={late ? c.danger : c.muted} />}
                        trailing={late ? <Badge label={t('home.late')} tone="danger" /> : undefined}
                        onPress={task.leadId ? () => router.push(`/lead/${task.leadId}`) : undefined}
                      />
                    </View>
                  );
                })
              )}
            </Card>
          </View>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value, tone = 'ink', onPress }: { label: string; value: number; tone?: 'ink' | 'warning' | 'accent'; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: 12, borderWidth: 0.5, borderColor: c.lineStrong, gap: 2 }}>
      <Text size="xl" weight="bold" tone={tone}>
        {value}
      </Text>
      <Text size="xs" tone="muted" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}
