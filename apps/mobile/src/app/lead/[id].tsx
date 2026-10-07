import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, Divider, Icon, Loading, Notice, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { write } from '@/lib/outbox';
import { ConnectionBar } from '@/components/ConnectionBar';
import { returnedAt, waitingHours, whatsappHref, type Lead, type Stage, type Task } from '@/lib/crm';
import { AddTask, setDone, TaskRow } from '@/components/Tasks';
import { date, relative, time } from '@/lib/format';
import { fonts, radius, useColors } from '@/lib/theme';
import { useApi } from '@/lib/use-api';
import { useWorkspaceFromLink } from '@/lib/session';

type Item =
  | { kind: 'visit'; id: string; at: string; card: { name: string } | null; returning: boolean; tapped: boolean; actions: { type: string; action?: string }[] }
  | { kind: 'created'; id: string; at: string; source: string | null; card: { name: string } | null }
  | { kind: 'activity'; id: string; at: string; type: string; metadata: Record<string, unknown> | null; author: { name: string } | null }
  | { kind: 'task'; id: string; at: string; event: 'created' | 'completed'; title: string };

interface Timeline {
  items: Item[];
  summary: { visits: number; returns: number; lastVisitAt: string | null; contacts: number; openTasks: number };
}

const CONTACT_ICON: Record<string, string> = { CALL: 'phone', WHATSAPP: 'whatsapp', EMAIL: 'mail', MEETING: 'calendar', NOTE: 'file-text', STAGE_CHANGE: 'chart-bar', MERGE: 'users' };

/** One lead: reach them in a tap, write down what happened, and see the whole story. */
export default function LeadScreen() {
  const { id, org } = useLocalSearchParams<{ id: string; org?: string }>();
  const inWorkspace = useWorkspaceFromLink(org);
  const { t } = useTranslation();
  const c = useColors();
  const lead = useApi<Lead & { stageId: string | null }>(`/leads/${id}`);
  const timeline = useApi<Timeline>(`/leads/${id}/timeline`);
  const stages = useApi<Stage[]>('/leads/stages');
  const tasks = useApi<Task[]>(`/tasks?leadId=${encodeURIComponent(id)}`);
  // Back from editing the lead: read it again.
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (seen.current) void lead.reload();
      seen.current = true;
    }, []),
  );

  async function toggleTask(task: Task) {
    const completed = !task.completed;
    tasks.setData((list) => list?.map((x) => (x.id === task.id ? { ...x, completed, completedAt: completed ? new Date().toISOString() : null } : x)) ?? null);
    try {
      if (!(await setDone(task, completed)).queued) void timeline.reload();
    } catch {
      tasks.setData((list) => list?.map((x) => (x.id === task.id ? task : x)) ?? null);
    }
  }
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Something written here waits on the phone for a connection. */
  const [kept, setKept] = useState(false);

  const l = lead.data;
  const stageName = (sid: unknown) => stages.data?.find((s) => s.id === sid)?.name ?? '—';

  async function reach(channel: 'CALL' | 'WHATSAPP' | 'EMAIL') {
    if (!l) return;
    const url = channel === 'CALL' ? `tel:${l.phone}` : channel === 'EMAIL' ? `mailto:${l.email}` : whatsappHref(l.phone ?? '');
    if (!url) return;
    // Reaching out is logged on the lead: the follow-up reminders wait for it.
    void write(`/leads/${id}/contact`, { method: 'POST', json: { channel } })
      .then((r) => {
        if (!r.queued) void timeline.reload();
      })
      .catch(() => undefined);
    await Linking.openURL(url).catch(() => setError(t('lead.cannotOpen')));
  }

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await write(`/leads/${id}/activities`, { method: 'POST', json: { type: 'NOTE', note: note.trim() } });
      setNote('');
      if (r.queued) setKept(true);
      else await timeline.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function moveTo(stageId: string) {
    if (!l || stageId === l.stageId) return;
    lead.setData({ ...l, stageId });
    try {
      const r = await write(`/leads/${id}`, { method: 'PATCH', json: { stageId } });
      if (!r.queued) void timeline.reload();
    } catch (e) {
      lead.setData(l);
      setError((e as Error).message);
    }
  }

  const items = useMemo(() => (timeline.data?.items ?? []).filter((i) => !(i.kind === 'activity' && i.type === 'NOTE' && !i.metadata?.note)), [timeline.data]);

  if (!inWorkspace || (lead.loading && !l)) return <Loading />;
  if (!l) return <Notice tone="danger">{lead.error ?? t('lead.notFound')}</Notice>;

  const back = returnedAt(l);
  const waiting = waitingHours(l);
  const wa = l.phone ? whatsappHref(l.phone) : null;

  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={timeline.refreshing} onRefresh={() => (lead.reload(), timeline.reload())} tintColor={c.accent} />}>
      <Stack.Screen
        options={{
          title: l.name || t('lead.title'),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('edit.title')} hitSlop={10} onPress={() => router.push(`/lead/edit/${id}`)} testID="lead-edit">
              <Icon name="edit" size={20} color={c.accentText} />
            </Pressable>
          ),
        }}
      />
      <Row gap={14}>
        <Avatar name={l.name || l.email} size={56} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text size="lg" weight="bold" numberOfLines={2}>
            {l.name || l.email || t('leads.unknown')}
          </Text>
          {l.company ? <Text tone="muted">{l.company}</Text> : null}
          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 4 }}>
            <Badge label={t(`temperature.${l.temperature}`)} tone={l.temperature === 'HOT' ? 'danger' : l.temperature === 'WARM' ? 'warning' : 'neutral'} />
            <Badge label={t(`sources.${l.source}`, { defaultValue: l.source })} />
          </Row>
        </View>
      </Row>

      <Row gap={8}>
        {l.phone ? <Action icon="phone" label={t('lead.call')} onPress={() => reach('CALL')} /> : null}
        {wa ? <Action icon="whatsapp" label="WhatsApp" onPress={() => reach('WHATSAPP')} /> : null}
        {l.email ? <Action icon="mail" label={t('lead.email')} onPress={() => reach('EMAIL')} /> : null}
      </Row>

      {back ? (
        <Notice>{t('lead.backOnCard', { when: relative(back) })}</Notice>
      ) : waiting !== null && waiting >= 24 ? (
        <Notice tone="warning">{t('lead.waiting', { count: Math.floor(waiting / 24) })}</Notice>
      ) : null}
      <ConnectionBar savedAt={lead.savedAt} />
      {kept ? <Notice>{t('offline.kept')}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {stages.data && stages.data.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle>{t('lead.stage')}</SectionTitle>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {stages.data.map((s) => {
              const on = s.id === l.stageId;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => moveTo(s.id)}
                  style={{ paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: on ? c.accent : c.surface, borderWidth: on ? 0 : 0.5, borderColor: c.lineStrong }}
                >
                  <Text size="sm" weight="medium" style={{ color: on ? c.onAccent : c.muted }}>
                    {t(`stages.${s.name.toLowerCase()}`, { defaultValue: s.name })}
                  </Text>
                </Pressable>
              );
            })}
          </Row>
        </View>
      )}

      <Card>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('lead.notePlaceholder')}
          placeholderTextColor={c.faint}
          multiline
          accessibilityLabel={t('lead.notePlaceholder')}
          style={{ minHeight: 64, color: c.ink, fontFamily: fonts.regular, fontSize: 15, textAlignVertical: 'top', textAlign: 'auto' }}
          testID="lead-note"
        />
        <Row style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <Button label={t('lead.addNote')} small onPress={addNote} busy={saving} disabled={!note.trim()} testID="lead-add-note" />
        </Row>
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('tasks.title')}</SectionTitle>
        <Card padded={false}>
          {(tasks.data ?? [])
            .filter((x) => !x.completed || Date.now() - new Date(x.completedAt ?? 0).getTime() < 86_400_000)
            .map((task, i) => (
              <View key={task.id}>
                {i > 0 && <Divider />}
                <TaskRow task={task} onToggle={toggleTask} showLead={false} />
              </View>
            ))}
          <View style={{ padding: 16, paddingTop: tasks.data?.length ? 8 : 16 }}>
            <AddTask
              leadId={id}
              onAdded={(task) => {
                tasks.setData((list) => [...(list ?? []), task]);
                void timeline.reload();
              }}
              onKept={() => setKept(true)}
            />
          </View>
        </Card>
      </View>

      {timeline.data && (
        <Row gap={10}>
          <Mini label={t('lead.visits')} value={timeline.data.summary.visits} />
          <Mini label={t('lead.contacts')} value={timeline.data.summary.contacts} />
          <Mini label={t('lead.openTasks')} value={timeline.data.summary.openTasks} />
        </Row>
      )}

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('lead.history')}</SectionTitle>
        <Card padded={false}>
          {items.map((it, i) => (
            <View key={it.id}>
              {i > 0 && <Divider />}
              <HistoryRow item={it} stageName={stageName} />
            </View>
          ))}
        </Card>
      </View>

      <Button label={t('lead.openOnWeb')} kind="secondary" icon="external-link" onPress={() => router.push({ pathname: '/web', params: { path: `/leads?lead=${id}` } })} />
    </Screen>
  );
}

function Action({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 64, borderRadius: radius.lg, backgroundColor: pressed ? c.elevated : c.surface, borderWidth: 0.5, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 4 })}>
      <Icon name={icon} size={20} color={c.accentText} />
      <Text size="xs" weight="medium">
        {label}
      </Text>
    </Pressable>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: 10, borderWidth: 0.5, borderColor: c.lineStrong }}>
      <Text size="lg" weight="bold">
        {value}
      </Text>
      <Text size="xs" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function HistoryRow({ item, stageName }: { item: Item; stageName: (id: unknown) => string }) {
  const { t } = useTranslation();
  const c = useColors();
  let icon = 'sparkle';
  let title = '';
  let body = '';
  switch (item.kind) {
    case 'visit':
      icon = 'eye';
      title = item.returning ? t('history.cameBack') : t('history.viewed');
      body = [item.tapped ? t('history.byTap') : t('history.byLink'), ...item.actions.map((a) => t(`history.did.${a.type === 'CLICK' ? a.action ?? 'link' : a.type}`, { defaultValue: t('history.did.link') }))].join(' · ');
      break;
    case 'created':
      icon = 'user-plus';
      title = t('history.created');
      body = [t(`sources.${item.source}`, { defaultValue: item.source ?? '' }), item.card?.name].filter(Boolean).join(' · ');
      break;
    case 'activity':
      icon = CONTACT_ICON[item.type] ?? 'sparkle';
      title = item.type === 'STAGE_CHANGE' ? t('history.moved', { from: stageName(item.metadata?.from), to: stageName(item.metadata?.to) }) : t(`history.types.${item.type}`, { defaultValue: item.type });
      body = [typeof item.metadata?.note === 'string' ? item.metadata.note : '', item.author?.name].filter(Boolean).join(' · ');
      break;
    case 'task':
      icon = item.event === 'completed' ? 'check' : 'plus';
      title = item.event === 'completed' ? t('history.taskDone') : t('history.taskAdded');
      body = item.title;
      break;
  }
  return (
    <Row gap={12} align="flex-start" style={{ padding: 14 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: item.kind === 'visit' && item.returning ? c.accent : c.elevated, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={15} color={item.kind === 'visit' && item.returning ? c.onAccent : c.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row style={{ justifyContent: 'space-between' }} gap={8}>
          <Text size="sm" weight="medium" style={{ flex: 1 }}>
            {title}
          </Text>
          <Text size="xs" tone="faint">
            {date(item.at, { day: 'numeric', month: 'short' })} {time(item.at)}
          </Text>
        </Row>
        {body ? (
          <Text size="sm" tone="muted">
            {body}
          </Text>
        ) : null}
      </View>
    </Row>
  );
}
