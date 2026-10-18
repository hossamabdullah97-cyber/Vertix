import { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, Field, Notice, Row, Text } from '@/components/ui';
import type { Identity } from '@/lib/card-editor';
import { useColors, radius } from '@/lib/theme';
import { pickAndUpload, type ImageSource } from '@/lib/upload';

/** A photo spot: the circle for the face, the wide band for the cover. Tap to change it. */
function PhotoSpot({ kind, url, onChange }: { kind: 'avatar' | 'cover'; url: string; onChange: (url: string) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const round = kind === 'avatar';

  async function from(source: ImageSource) {
    setBusy(true);
    setError(null);
    try {
      const next = await pickAndUpload(source, round ? [1, 1] : [3, 1]);
      if (next) onChange(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function choose() {
    Alert.alert(t(round ? 'editor.photo' : 'editor.cover'), undefined, [
      { text: t('editor.takePhoto'), onPress: () => void from('camera') },
      { text: t('editor.choosePhoto'), onPress: () => void from('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <View style={{ gap: 6, flex: round ? undefined : 1 }}>
      <Text size="sm" weight="medium">
        {t(round ? 'editor.photo' : 'editor.cover')}
      </Text>
      <Pressable
        onPress={busy ? undefined : choose}
        accessibilityRole="button"
        accessibilityLabel={t(round ? 'editor.photo' : 'editor.cover')}
        testID={`editor-${kind}`}
        style={{
          width: round ? 88 : '100%',
          height: 88,
          borderRadius: round ? 44 : radius.lg,
          backgroundColor: c.elevated,
          borderWidth: 1,
          borderStyle: url ? 'solid' : 'dashed',
          borderColor: c.lineStrong,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        <View
          style={{
            position: 'absolute',
            bottom: 6,
            end: round ? undefined : 6,
            alignSelf: 'center',
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderRadius: 999,
            padding: 6,
          }}
        >
          <Icon name={busy ? 'loader' : 'camera'} size={16} color="#FFFFFF" />
        </View>
      </Pressable>
      {url && !busy ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" hitSlop={8}>
          <Text size="xs" tone="danger" style={{ textAlign: round ? 'center' : 'auto' }}>
            {t('editor.removePhoto')}
          </Text>
        </Pressable>
      ) : null}
      {error ? (
        <Text size="xs" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Who the card is: the face, the name, what they do, and how to reach them. */
export function ProfileTab({
  identity,
  about,
  onIdentity,
  onAbout,
}: {
  identity: Identity;
  about: string;
  onIdentity: (next: Identity) => void;
  onAbout: (text: string) => void;
}) {
  const { t } = useTranslation();
  const set = (k: keyof Identity) => (v: string) => onIdentity({ ...identity, [k]: v });

  return (
    <View style={{ gap: 14 }}>
      <Row gap={14} align="flex-start">
        <PhotoSpot kind="avatar" url={identity.avatar} onChange={set('avatar')} />
        <PhotoSpot kind="cover" url={identity.coverImage} onChange={set('coverImage')} />
      </Row>
      <Field label={t('editor.fullName')} value={identity.fullName} onChangeText={set('fullName')} placeholder={t('editor.fullNameHint')} autoComplete="name" testID="editor-name" />
      <Field label={t('editor.jobTitle')} value={identity.title} onChangeText={set('title')} placeholder={t('editor.jobTitleHint')} testID="editor-title" />
      <Field label={t('editor.company')} value={identity.company} onChangeText={set('company')} placeholder={t('editor.companyHint')} autoComplete="organization" />
      <Field label={t('editor.phone')} value={identity.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+20 100 000 0000" autoComplete="tel" />
      <Field label={t('editor.email')} value={identity.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="name@company.com" />
      <Field label={t('editor.location')} value={identity.location} onChangeText={set('location')} placeholder={t('editor.locationHint')} />
      <Field
        label={t('editor.about')}
        value={about}
        onChangeText={onAbout}
        placeholder={t('editor.aboutHint')}
        multiline
        maxLength={600}
        textAlignVertical="top"
        style={{ minHeight: 110, paddingTop: 12 }}
        hint={t('editor.aboutCount', { count: about.length })}
        testID="editor-about"
      />
      <Notice>{t('editor.profileNote')}</Notice>
    </View>
  );
}
