import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Icon, ListItem, Notice, SectionTitle, Sheet, Text, ToggleRow } from '@/components/ui';
import { useCardEditor } from '@/lib/card-draft';
import { slugProblem } from '@/lib/card-editor';
import { WEB_BASE } from '@/lib/config';
import { useColors } from '@/lib/theme';

/** Whether the card is live, its address, what is still done on the website, and removing it. */
export function SettingsSheet({ visible, onClose, onWebsite, onDelete }: { visible: boolean; onClose: () => void; onWebsite: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const { card, setPublished, saveSlug } = useCardEditor();
  const [slug, setSlug] = useState(card.slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    // The address the server holds (it may name a new card after its name).
    setSlug(card.slug);
  }, [card.slug]);
  const problem = slugProblem(slug);
  const host = WEB_BASE.replace(/^https?:\/\//, '');

  async function publish(on: boolean) {
    setError(null);
    try {
      await setPublished(on);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function changeAddress() {
    Alert.alert(t('editor.slugConfirmTitle'), t('editor.slugWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('editor.slugSave'),
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await saveSlug(slug);
            setDone(true);
            setTimeout(() => setDone(false), 2500);
          } catch (e) {
            setError((e as Error).message === 'taken' ? t('editor.slugTaken') : (e as Error).message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <Sheet visible={visible} title={t('editor.sections.settings')} onClose={onClose} closeLabel={t('common.close')} doneLabel={t('editor.done')}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card padded={false}>
        <ToggleRow title={t('editor.published')} hint={t(card.isPublished ? 'editor.publishedOn' : 'editor.publishedOff')} value={card.isPublished} onChange={(on) => void publish(on)} testID="editor-published" />
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.slug')}</SectionTitle>
        <Card>
          <View style={{ gap: 10 }}>
            <Field
              label={t('editor.slugLabel')}
              value={slug}
              onChangeText={(v) => setSlug(v.toLowerCase().replace(/\s+/g, '-'))}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ textAlign: 'left' }}
              error={problem ? t(`editor.slugProblem.${problem}`) : null}
              hint={`${host}/c/${slug || '…'}`}
              testID="editor-slug"
            />
            {done ? <Notice tone="success">{t('editor.slugSaved')}</Notice> : null}
            <Button label={t('editor.slugSave')} kind="secondary" icon="check" onPress={changeAddress} busy={busy} disabled={!!problem || slug === card.slug} testID="editor-slug-save" />
          </View>
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.onWebsite')}</SectionTitle>
        <Card padded={false}>
          <ListItem title={t('editor.onWebsiteTitle')} subtitle={t('editor.onWebsiteBody')} subtitleLines={3} leading={<Icon name="external-link" size={20} color={c.muted} />} onPress={onWebsite} />
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.danger')}</SectionTitle>
        <Card>
          <View style={{ gap: 12 }}>
            <Text size="sm" tone="muted">
              {t('editor.deleteBody')}
            </Text>
            <Button label={t('editor.delete')} kind="danger" icon="trash" onPress={onDelete} testID="editor-delete" />
          </View>
        </Card>
      </View>
    </Sheet>
  );
}
