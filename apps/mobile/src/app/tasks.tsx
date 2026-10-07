import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AddTask, setDone, TaskRow } from '@/components/Tasks';
import { ConnectionBar } from '@/components/ConnectionBar';
import { Card, Divider, Empty, Loading, Notice, Screen, SectionTitle } from '@/components/ui';
import type { Task } from '@/lib/crm';
import { groupTasks } from '@/lib/tasks';
import { useColors } from '@/lib/theme';
import { useApi } from '@/lib/use-api';

/** Everything to do, late first; ticked off in a tap, added in two. */
export default function Tasks() {
  const { t } = useTranslation();
  const c = useColors();
  const { data, setData, error, loading, refreshing, reload, savedAt } = useApi<Task[]>('/tasks');
  const groups = useMemo(() => groupTasks(data ?? []), [data]);
  const [kept, setKept] = useState(false);

  async function toggle(task: Task) {
    const completed = !task.completed;
    const optimistic = { ...task, completed, completedAt: completed ? new Date().toISOString() : null };
    setData((list) => list?.map((x) => (x.id === task.id ? optimistic : x)) ?? null);
    try {
      const r = await setDone(task, completed);
      if (!r.queued) setData((list) => list?.map((x) => (x.id === task.id ? { ...x, ...r.data, lead: x.lead } : x)) ?? null);
    } catch {
      setData((list) => list?.map((x) => (x.id === task.id ? task : x)) ?? null);
    }
  }

  const section = (key: keyof typeof groups, title: string) =>
    groups[key].length > 0 && (
      <View style={{ gap: 8 }} key={key}>
        <SectionTitle>{`${title} · ${groups[key].length}`}</SectionTitle>
        <Card padded={false}>
          {groups[key].slice(0, key === 'done' ? 20 : undefined).map((task, i) => (
            <View key={task.id}>
              {i > 0 && <Divider />}
              <TaskRow task={task} onToggle={toggle} />
            </View>
          ))}
        </Card>
      </View>
    );

  const open = groups.overdue.length + groups.today.length + groups.upcoming.length + groups.someday.length;
  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.accent} />}>
      <ConnectionBar savedAt={savedAt} />
      <Card>
        <AddTask onAdded={(task) => setData((list) => [task, ...(list ?? [])])} onKept={() => setKept(true)} />
      </Card>
      {kept && <Notice>{t('offline.kept')}</Notice>}
      {error && !data ? (
        <Notice tone="danger">{error}</Notice>
      ) : loading && !data ? (
        <Loading />
      ) : open === 0 && !groups.done.length ? (
        <Empty icon="check" title={t('tasks.empty')} body={t('tasks.emptyBody')} />
      ) : (
        <>
          {open === 0 && <Empty icon="check" title={t('tasks.allDone')} />}
          {section('overdue', t('tasks.groups.overdue'))}
          {section('today', t('tasks.groups.today'))}
          {section('upcoming', t('tasks.groups.upcoming'))}
          {section('someday', t('tasks.groups.someday'))}
          {section('done', t('tasks.groups.done'))}
        </>
      )}
    </Screen>
  );
}
