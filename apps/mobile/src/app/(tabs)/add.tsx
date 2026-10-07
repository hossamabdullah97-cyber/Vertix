import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Notice, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';

interface Scanned {
  name: string | null;
  title: string | null;
  company: string | null;
  emails: string[];
  phones: string[];
  website: string | null;
}

const EMPTY = { name: '', phone: '', email: '', company: '', title: '', note: '' };

/** Met someone: their details in a few taps, or read from their paper card. */
export default function AddLead() {
  const { t } = useTranslation();
  const scan = useApi<{ available: boolean }>('/leads/scan');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<'save' | 'scan' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const enough = !!(form.name.trim() || form.phone.trim() || form.email.trim());

  async function readCard(source: 'camera' | 'library') {
    setError(null);
    const ask = source === 'camera' ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    if (Platform.OS !== 'web' && !(await ask()).granted) {
      setError(t('add.noPermission'));
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setBusy('scan');
    try {
      const body = new FormData();
      if (Platform.OS === 'web') body.append('file', await (await fetch(asset.uri)).blob(), 'card.jpg');
      else body.append('file', { uri: asset.uri, name: asset.fileName ?? 'card.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
      const c = await api<Scanned>('/leads/scan', { method: 'POST', body });
      setForm((f) => ({
        ...f,
        name: c.name ?? f.name,
        company: c.company ?? f.company,
        title: c.title ?? f.title,
        email: c.emails[0] ?? f.email,
        phone: c.phones[0] ?? f.phone,
      }));
      setRead(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!enough) return;
    setBusy('save');
    setError(null);
    try {
      const body: Record<string, string> = { source: read ? 'card_scan' : 'in_person' };
      for (const [k, v] of Object.entries(form)) if (v.trim()) body[k] = v.trim();
      const lead = await api<{ id: string }>('/leads', { method: 'POST', json: body });
      setForm(EMPTY);
      setRead(false);
      router.push(`/lead/${lead.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <Text size="xl" weight="bold">
          {t('add.title')}
        </Text>
        <Text tone="muted">{t('add.subtitle')}</Text>

        {scan.data?.available && (
          <Card style={{ gap: 10 }}>
            <Text weight="semibold">{t('add.scanTitle')}</Text>
            <Text size="sm" tone="muted">
              {read ? t('add.scanned') : t('add.scanBody')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label={t('add.takePhoto')} icon="camera" onPress={() => readCard('camera')} busy={busy === 'scan'} style={{ flex: 1 }} testID="add-scan" />
              <Button label={t('add.choosePhoto')} kind="secondary" icon="image" onPress={() => readCard('library')} disabled={busy === 'scan'} style={{ flex: 1 }} />
            </View>
          </Card>
        )}

        {error ? <Notice tone="danger">{error}</Notice> : null}

        <View style={{ gap: 14 }}>
          <Field label={t('add.name')} value={form.name} onChangeText={set('name')} autoComplete="name" testID="add-name" />
          <Field label={t('add.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" testID="add-phone" />
          <Field label={t('add.email')} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" testID="add-email" />
          <Field label={t('add.company')} value={form.company} onChangeText={set('company')} testID="add-company" />
          <Field label={t('add.jobTitle')} value={form.title} onChangeText={set('title')} />
          <Field label={t('add.note')} value={form.note} onChangeText={set('note')} multiline style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }} hint={t('add.noteHint')} />
        </View>
        <Button label={t('add.save')} icon="user-plus" onPress={save} busy={busy === 'save'} disabled={!enough} testID="add-save" />
      </Screen>
    </KeyboardAvoidingView>
  );
}
