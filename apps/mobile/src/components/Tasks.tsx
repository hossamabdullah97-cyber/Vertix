import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { write, type Written } from '@/lib/outbox';
import type { Task } from '@/lib/crm';
import { date } from '@/lib/format';
import { dueAt, type DueChoice } from '@/lib/tasks';
import { useColors } from '@/lib/theme';
import { Badge, Button, Field, Icon, Segmented, Text } from './ui';

/** Ticks a task off (or back on) on the server, or on the phone until there is a connection; the screen updates first. */
export function setDone(task: Task, completed: boolean): Promise<Written<Task>> {
  return write<Task>(`/tasks/${task.id}`, { method: 'PATCH', json: { completed } });
}

/** One task: a box to tick, what it is, for whom, and when. */
export function TaskRow({ task, onToggle, showLead = true }: { task: Task; onToggle: (t: Task) => void; showLead?: boolean }) {
  const { t } = useTranslation();
  const c = useColors();
  const late = !task.completed && !!task.dueDate && new Date(task.dueDate).getTime() < Date.now();
  const when = task.dueDate ? date(task.dueDate, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  const sub = [showLead ? task.lead?.name : null, when].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.completed }}
        accessibilityLabel={task.title}
        hitSlop={10}
        onPress={() => onToggle(task)}
        testID="task-toggle"
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: task.completed ? c.success : late ? c.danger : c.lineStrong,
          backgroundColor: task.completed ? c.success : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {task.completed && <Icon name="check" size={14} color="#fff" />}
      </Pressable>
      <Pressable style={{ flex: 1, minWidth: 0, gap: 2 }} disabled={!task.leadId || !showLead} onPress={() => router.push(`/lead/${task.leadId}`)}>
        <Text weight="medium" numberOfLines={2} tone={task.completed ? 'faint' : 'ink'} style={task.completed ? { textDecorationLine: 'line-through' } : undefined}>
          {task.title}
        </Text>
        {sub ? (
          <Text size="sm" tone={late ? 'danger' : 'muted'} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </Pressable>
      {late && <Badge label={t('tasks.late')} tone="danger" />}
    </View>
  );
}

/** A new task in a few taps: what to do, and a quick choice of when. */
export function AddTask({ leadId, onAdded, onKept }: { leadId?: string; onAdded: (t: Task) => void; /** Kept on the phone until there is a connection. */ onKept?: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<DueChoice>('tomorrow');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const due = dueAt(when);
      const r = await write<Task>('/tasks', { method: 'POST', json: { title: title.trim(), ...(leadId ? { leadId } : {}), ...(due ? { dueDate: due.toISOString() } : {}) } });
      setTitle('');
      if (r.queued) onKept?.();
      else onAdded(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Field label={t('tasks.new')} value={title} onChangeText={setTitle} placeholder={t('tasks.placeholder')} returnKeyType="done" onSubmitEditing={add} error={error} testID="task-title" />
      <Segmented<DueChoice>
        value={when}
        onChange={setWhen}
        options={(['today', 'tomorrow', 'in3', 'nextWeek', 'none'] as const).map((v) => ({ value: v, label: t(`tasks.due.${v}`) }))}
      />
      <Button label={t('tasks.add')} icon="plus" onPress={add} busy={busy} disabled={!title.trim()} testID="task-add" />
    </View>
  );
}
