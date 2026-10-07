import { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Divider, Empty, Icon, ListItem, Loading, Notice, Row, Segmented, Text } from '@/components/ui';
import { awaitsReply, filterLeads, returnedAt, search, waitingHours, type Lead, type LeadFilter } from '@/lib/crm';
import { relative } from '@/lib/format';
import { fonts, radius, useColors } from '@/lib/theme';
import { useApi } from '@/lib/use-api';

/** Every lead the person may see, newest first: searched, and narrowed to who needs them. */
export default function Leads() {
  const { t } = useTranslation();
  const c = useColors();
  const params = useLocalSearchParams<{ filter?: LeadFilter }>();
  const [filter, setFilter] = useState<LeadFilter>(params.filter ?? 'all');
  const [q, setQ] = useState('');
  const { data, error, loading, refreshing, reload } = useApi<Lead[]>('/leads');

  useEffect(() => {
    if (params.filter) setFilter(params.filter);
  }, [params.filter]);

  const shown = useMemo(() => search(filterLeads(data ?? [], filter), q), [data, filter, q]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 12 }}>
        <Text size="xl" weight="bold">
          {t('leads.title')}
        </Text>
        <Row gap={8} style={{ backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 0.5, borderColor: c.lineStrong, paddingHorizontal: 12 }}>
          <Icon name="search" size={18} color={c.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('leads.search')}
            placeholderTextColor={c.faint}
            accessibilityLabel={t('leads.search')}
            autoCorrect={false}
            style={{ flex: 1, minHeight: 44, color: c.ink, fontFamily: fonts.regular, fontSize: 16, textAlign: 'auto' }}
            testID="leads-search"
          />
        </Row>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('leads.filters.all') },
            { value: 'waiting', label: t('leads.filters.waiting') },
            { value: 'back', label: t('leads.filters.back') },
            { value: 'hot', label: t('leads.filters.hot') },
          ]}
        />
      </View>
      {error && !data ? (
        <View style={{ padding: 16 }}>
          <Notice tone="danger">{error}</Notice>
        </View>
      ) : loading && !data ? (
        <Loading />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(l) => l.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={c.accent} />}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={shown.length ? { backgroundColor: c.surface } : undefined}
          ListEmptyComponent={<Empty icon="inbox" title={q || filter !== 'all' ? t('leads.noMatch') : t('leads.empty')} body={q || filter !== 'all' ? undefined : t('leads.emptyBody')} />}
          renderItem={({ item: l }) => <LeadRow lead={l} />}
        />
      )}
    </SafeAreaView>
  );
}

function LeadRow({ lead: l }: { lead: Lead }) {
  const { t } = useTranslation();
  const back = returnedAt(l);
  const waiting = awaitsReply(l) ? waitingHours(l) : null;
  return (
    <ListItem
      testID="lead-row"
      title={l.name || l.email || l.phone || t('leads.unknown')}
      subtitle={[l.company, t(`sources.${l.source}`, { defaultValue: l.source })].filter(Boolean).join(' · ')}
      leading={<Avatar name={l.name || l.email} size={40} />}
      trailing={
        back ? (
          <Badge label={t('leads.backBadge', { when: relative(back) })} tone="accent" />
        ) : waiting !== null ? (
          <Badge label={t('leads.waitingFor', { count: Math.floor(waiting / 24) })} tone="warning" />
        ) : l.temperature === 'HOT' ? (
          <Badge label={t('leads.hot')} tone="danger" />
        ) : undefined
      }
      onPress={() => router.push(`/lead/${l.id}`)}
    />
  );
}
