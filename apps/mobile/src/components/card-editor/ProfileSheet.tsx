import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CoverArt } from '@/components/CardFace';
import { Card, Field, Icon, Notice, Sheet, Text } from '@/components/ui';
import { useCardEditor } from '@/lib/card-draft';
import { radius, useColors } from '@/lib/theme';
import { pickAndUpload, type ImageSource } from '@/lib/upload';

/** Picks a photo for a spot (camera or photos), uploads it, and hands back its address. */
function usePhotoPicker(aspect: [number, number], onChange: (url: string) => void) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function from(source: ImageSource) {
    setBusy(true);
    setError(null);
    try {
      const url = await pickAndUpload(source, aspect);
      if (url) onChange(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const choose = (title: string) =>
    Alert.alert(title, undefined, [
      { text: t('editor.takePhoto'), onPress: () => void from('camera') },
      { text: t('editor.choosePhoto'), onPress: () => void from('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  return { busy, error, choose };
}

/** A small round camera badge on a photo spot. */
function CameraBadge({ busy }: { busy: boolean }) {
  return (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: 7, borderWidth: 2, borderColor: '#FFFFFF' }}>
      <Icon name={busy ? 'loader' : 'camera'} size={15} color="#FFFFFF" />
    </View>
  );
}

/**
 * Who the card is: the cover and photo as they sit on the card (tap either to
 * change it), then the name, what they do, where, and the About. Kept as it
 * is typed.
 */
export function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const { card, draft, setIdentity, setAbout } = useCardEditor();
  const { identity, look, about } = draft;
  const cover = usePhotoPicker([3, 1], (coverImage) => setIdentity({ coverImage }));
  const photo = usePhotoPicker([1, 1], (avatar) => setIdentity({ avatar }));
  const error = cover.error ?? photo.error;

  return (
    <Sheet visible={visible} title={t('editor.sections.profile')} onClose={onClose} closeLabel={t('common.close')} doneLabel={t('editor.done')}>
      <View>
        <Pressable
          onPress={() => !cover.busy && cover.choose(t('editor.cover'))}
          accessibilityRole="button"
          accessibilityLabel={t('editor.changeCover')}
          testID="profile-cover"
          style={{ height: 132, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.elevated }}
        >
          {identity.coverImage ? (
            <Image source={{ uri: identity.coverImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <CoverArt cover={look.cover} accent={look.accent} id={`profile-${card.id}`} />
          )}
          <View style={{ position: 'absolute', top: 10, end: 10 }}>
            <CameraBadge busy={cover.busy} />
          </View>
        </Pressable>
        <Pressable
          onPress={() => !photo.busy && photo.choose(t('editor.photo'))}
          accessibilityRole="button"
          accessibilityLabel={t('editor.changePhoto')}
          testID="profile-photo"
          style={{ marginTop: -48, marginStart: 18, alignSelf: 'flex-start' }}
        >
          <View style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: c.canvas, backgroundColor: c.elevated, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {identity.avatar ? <Image source={{ uri: identity.avatar }} style={{ width: '100%', height: '100%' }} /> : <Icon name="user" size={38} color={c.faint} />}
          </View>
          <View style={{ position: 'absolute', bottom: 0, end: 0 }}>
            <CameraBadge busy={photo.busy} />
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, paddingHorizontal: 4 }}>
          {identity.avatar ? (
            <Pressable onPress={() => setIdentity({ avatar: '' })} hitSlop={8} accessibilityRole="button">
              <Text size="xs" tone="danger">
                {t('editor.removePhoto')}
              </Text>
            </Pressable>
          ) : null}
          {identity.coverImage ? (
            <Pressable onPress={() => setIdentity({ coverImage: '' })} hitSlop={8} accessibilityRole="button">
              <Text size="xs" tone="danger">
                {t('editor.removeCover')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <View style={{ gap: 14 }}>
          <Field label={t('editor.fullName')} value={identity.fullName} onChangeText={(fullName) => setIdentity({ fullName })} placeholder={t('editor.fullNameHint')} autoComplete="name" testID="editor-name" />
          <Field label={t('editor.jobTitle')} value={identity.title} onChangeText={(title) => setIdentity({ title })} placeholder={t('editor.jobTitleHint')} testID="editor-title" />
          <Field label={t('editor.company')} value={identity.company} onChangeText={(company) => setIdentity({ company })} placeholder={t('editor.companyHint')} autoComplete="organization" testID="editor-company" />
          <Field label={t('editor.location')} value={identity.location} onChangeText={(location) => setIdentity({ location })} placeholder={t('editor.locationHint')} />
        </View>
      </Card>

      <Card>
        <Field
          label={t('editor.about')}
          value={about}
          onChangeText={setAbout}
          placeholder={t('editor.aboutHint')}
          multiline
          maxLength={600}
          textAlignVertical="top"
          style={{ minHeight: 120, paddingTop: 12 }}
          hint={t('editor.aboutCount', { count: about.length })}
          testID="editor-about"
        />
      </Card>
      <Notice>{t('editor.contactElsewhere')}</Notice>
    </Sheet>
  );
}
