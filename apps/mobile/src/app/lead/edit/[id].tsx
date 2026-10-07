import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Field, Loading, Notice, Screen, Segmented, Text } from '@/components/ui';
import { write } from '@/lib/outbox';
import type { Lead } from '@/lib/crm';
import { useApi } from '@/lib/use-api';

type Temperature = Lead['temperature'];
interface Form {
  name: string;
  phone: string;
  email: string;
  company: string;
  value: string;
  temperature: Temperature;
}

/** A lead's details, put right on the spot: a number caught wrong, the company, how warm they are. */
export default function EditLead() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const lead = useApi<Lead>(`/leads/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const l = lead.data;
    if (l && !form) {
      setForm({ name: l.name ?? '', phone: l.phone ?? '', email: l.email ?? '', company: l.company ?? '', value: l.value ? String(l.value) : '', temperature: l.temperature });
    }
  }, [lead.data, form]);

  if (!form) return lead.error ? <Notice tone="danger">{lead.error}</Notice> : <Loading />;
  const set = (k: keyof Form) => (v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const value = form.value.trim() === '' ? 0 : Number(form.value.replace(/[,\s]/g, ''));
  const valueBad = !Number.isFinite(value) || value < 0;
  const enough = !!(form.name.trim() || form.phone.trim() || form.email.trim());

  async function save() {
    if (!form || valueBad || !enough) return;
    setBusy(true);
    setError(null);
    try {
      await write(`/leads/${id}`, {
        method: 'PATCH',
        json: { name: form.name, phone: form.phone, email: form.email, company: form.company, value, temperature: form.temperature },
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen edges={[]}>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <View style={{ gap: 14 }}>
          <Field label={t('add.name')} value={form.name} onChangeText={set('name')} autoComplete="name" testID="edit-name" />
          <Field label={t('add.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" testID="edit-phone" />
          <Field label={t('add.email')} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <Field label={t('add.company')} value={form.company} onChangeText={set('company')} />
          <Field
            label={t('edit.value')}
            value={form.value}
            onChangeText={set('value')}
            keyboardType="decimal-pad"
            hint={t('edit.valueHint')}
            error={valueBad ? t('edit.valueBad') : null}
            testID="edit-value"
          />
          <View style={{ gap: 6 }}>
            <Text size="sm" weight="medium">
              {t('edit.temperature')}
            </Text>
            <Segmented<Temperature>
              value={form.temperature}
              onChange={(v) => setForm((f) => (f ? { ...f, temperature: v } : f))}
              options={(['HOT', 'WARM', 'COLD'] as const).map((v) => ({ value: v, label: t(`temperature.${v}`) }))}
            />
          </View>
        </View>
        {!enough && <Notice tone="warning">{t('edit.needOne')}</Notice>}
        <Button label={t('edit.save')} icon="check" onPress={save} busy={busy} disabled={valueBad || !enough} testID="edit-save" />
      </Screen>
    </KeyboardAvoidingView>
  );
}
