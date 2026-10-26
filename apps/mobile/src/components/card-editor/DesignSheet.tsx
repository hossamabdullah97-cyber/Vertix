import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CoverArt } from '@/components/CardFace';
import { LivePreview } from '@/components/LivePreview';
import { Card, Divider, Icon, Row, Segmented, SectionTitle, Sheet, Text, ToggleRow } from '@/components/ui';
import { useCardEditor } from '@/lib/card-draft';
import { COVERS, LAYOUTS, LINK_STYLES, MODES, SWATCHES, TEMPLATES, lightness, templateCover } from '@/lib/card-editor';
import { radius, useColors } from '@/lib/theme';

/**
 * How the card looks, with the card itself above (as visitors see it) while
 * choosing: a ready-made design first, then the colour, light or dark, and
 * the cover; the finer choices fold away under More options.
 */
export function DesignSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const { card, draft, setLook, live } = useCardEditor();
  const look = draft.look;
  const [more, setMore] = useState(false);

  return (
    <Sheet
      visible={visible}
      title={t('editor.sections.design')}
      onClose={onClose}
      closeLabel={t('common.close')}
      doneLabel={t('editor.done')}
      top={<LivePreview cardId={card.id} live={live} style={{ height: 250, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.lineStrong }} />}
    >
      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.templates')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {TEMPLATES.map((tpl) => {
            const on = look.templateId === tpl.id;
            const dark = tpl.mode === 'dark';
            return (
              <Pressable
                key={tpl.id}
                onPress={() => setLook({ templateId: tpl.id, accent: tpl.accent, mode: tpl.mode, cover: templateCover(tpl) })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={tpl.name}
                testID={`tpl-${tpl.id}`}
                style={{ width: '31%', gap: 6 }}
              >
                <View
                  style={{
                    height: 104,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                    backgroundColor: dark ? '#141416' : '#FFFFFF',
                    borderWidth: on ? 2.5 : StyleSheet.hairlineWidth,
                    borderColor: on ? c.accent : c.lineStrong,
                  }}
                >
                  <View style={{ height: 36 }}>
                    <CoverArt cover={templateCover(tpl)} accent={tpl.accent} id={`tpl-${tpl.id}`} />
                  </View>
                  <View style={{ padding: 8, gap: 5 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, marginTop: -19, backgroundColor: tpl.accent, borderWidth: 2, borderColor: dark ? '#141416' : '#FFFFFF' }} />
                    <View style={{ height: 5, width: '70%', borderRadius: 3, backgroundColor: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }} />
                    <View style={{ height: 4, width: '50%', borderRadius: 2, backgroundColor: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)' }} />
                    <View style={{ height: 9, borderRadius: 3, backgroundColor: tpl.accent, opacity: 0.9, marginTop: 3 }} />
                  </View>
                  {on ? (
                    <View style={{ position: 'absolute', top: 6, end: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={13} color={c.onAccent} />
                    </View>
                  ) : null}
                </View>
                <Text size="xs" weight={on ? 'semibold' : 'regular'} tone={on ? 'ink' : 'muted'} numberOfLines={1} style={{ textAlign: 'center' }}>
                  {tpl.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.accent')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SWATCHES.map((hex) => {
            const on = look.accent.toLowerCase() === hex;
            return (
              <Pressable
                key={hex}
                onPress={() => setLook({ accent: hex })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={hex}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: hex,
                  borderWidth: on ? 3 : StyleSheet.hairlineWidth,
                  borderColor: on ? c.ink : c.lineStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? <Icon name="check" size={16} color={lightness(hex) > 0.6 ? '#18181B' : '#FFFFFF'} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.mode')}</SectionTitle>
        <Segmented value={look.mode} onChange={(mode) => setLook({ mode })} options={MODES.map((m) => ({ value: m, label: t(`editor.modes.${m}`) }))} />
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.coverStyle')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {COVERS.map((cov) => {
            const on = look.cover === cov;
            return (
              <Pressable key={cov} onPress={() => setLook({ cover: cov })} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ width: '30%', gap: 4 }}>
                <View style={{ height: 52, borderRadius: radius.md, overflow: 'hidden', borderWidth: on ? 2.5 : StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.lineStrong }}>
                  <CoverArt cover={cov} accent={look.accent} id={`cov-${cov}`} />
                </View>
                <Text size="xs" tone={on ? 'ink' : 'muted'} weight={on ? 'semibold' : 'regular'} style={{ textAlign: 'center' }}>
                  {t(`editor.covers.${cov}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {draft.identity.coverImage ? (
          <Text size="xs" tone="faint" style={{ paddingHorizontal: 4 }}>
            {t('editor.coverPhotoWins')}
          </Text>
        ) : null}
      </View>

      <Card padded={false}>
        <Pressable onPress={() => setMore((m) => !m)} accessibilityRole="button" accessibilityState={{ expanded: more }} testID="design-more">
          <Row gap={12} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Icon name="settings" size={20} color={c.muted} />
            <View style={{ flex: 1 }}>
              <Text weight="medium">{t('editor.moreDesign')}</Text>
              <Text size="xs" tone="faint">
                {t('editor.moreDesignHint')}
              </Text>
            </View>
            <Icon name={more ? 'chevron-up' : 'chevron-down'} size={18} color={c.faint} />
          </Row>
        </Pressable>
        {more ? (
          <View>
            <Divider />
            <View style={{ padding: 16, gap: 16 }}>
              <View style={{ gap: 8 }}>
                <Text size="sm" weight="medium">
                  {t('editor.layout')}
                </Text>
                <Segmented value={look.layout} onChange={(layout) => setLook({ layout })} options={LAYOUTS.map((l) => ({ value: l, label: t(`editor.layouts.${l}`) }))} />
              </View>
              <View style={{ gap: 8 }}>
                <Text size="sm" weight="medium">
                  {t('editor.linkStyle')}
                </Text>
                <Segmented value={look.links} onChange={(links) => setLook({ links })} options={LINK_STYLES.map((s) => ({ value: s, label: t(`editor.linkStyles.${s}`) }))} />
              </View>
              <View style={{ gap: 8 }}>
                <Text size="sm" weight="medium">
                  {t('editor.cardLanguage')}
                </Text>
                <Segmented
                  value={look.lang}
                  onChange={(lang) => setLook({ lang })}
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'ar', label: 'العربية' },
                  ]}
                />
              </View>
            </View>
            <Divider />
            <ToggleRow title={t('editor.brand')} hint={t('editor.brandHint')} value={look.brand} onChange={(brand) => setLook({ brand })} />
            <Divider />
            <ToggleRow title={t('editor.openInApp')} hint={t('editor.openInAppHint')} value={look.openInApp} onChange={(openInApp) => setLook({ openInApp })} />
          </View>
        ) : null}
      </Card>
    </Sheet>
  );
}
