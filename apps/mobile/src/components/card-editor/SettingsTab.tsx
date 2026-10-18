import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Field, Icon, ListItem, Notice, SectionTitle, Text, ToggleRow } from '@/components/ui';
import { slugProblem } from '@/lib/card-editor';
import { WEB_BASE } from '@/lib/config';
import { useColors } from '@/lib/theme';

/** Whether the card is live, its address, what is still done on the website, and removing it. */
export function SettingsTab({
  published,
  publishing,
  onPublished,
  slug,
  onSlug,
  onWebsite,
  onDelete,
}: {
  published: boolean;
  publishing: boolean;
  onPublished: (on: boolean) => void;
  slug: string;
  onSlug: (slug: string) => void;
  onWebsite: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const c = useColors();
  const problem = slugProblem(slug);
  const host = WEB_BASE.replace(/^https?:\/\//, '');

  return (
    <View style={{ gap: 18 }}>
      <Card padded={false}>
        <ToggleRow title={t('editor.published')} hint={t(published ? 'editor.publishedOn' : 'editor.publishedOff')} value={published} onChange={onPublished} disabled={publishing} testID="editor-published" />
      </Card>

      <View style={{ gap: 8 }}>
        <Field
          label={t('editor.slug')}
          value={slug}
          onChangeText={(v) => onSlug(v.toLowerCase().replace(/\s+/g, '-'))}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ textAlign: 'left' }}
          error={problem ? t(`editor.slugProblem.${problem}`) : null}
          hint={`${host}/c/${slug || '…'}`}
          testID="editor-slug"
        />
        <Notice tone="warning">{t('editor.slugWarning')}</Notice>
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
          <View style={{ gap: 10 }}>
            <Text size="sm" tone="muted">
              {t('editor.deleteBody')}
            </Text>
            <Divider />
            <Button label={t('editor.delete')} kind="danger" icon="trash" onPress={onDelete} testID="editor-delete" />
          </View>
        </Card>
      </View>
    </View>
  );
}
