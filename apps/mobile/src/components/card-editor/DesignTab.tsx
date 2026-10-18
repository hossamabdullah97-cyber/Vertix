import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CoverArt } from '@/components/CardFace';
import { Card, Divider, Icon, Segmented, SectionTitle, Text, ToggleRow } from '@/components/ui';
import { COVERS, LAYOUTS, LINK_STYLES, MODES, SWATCHES, TEMPLATES, lightness, templateCover, type Look } from '@/lib/card-editor';
import { radius, useColors } from '@/lib/theme';

/** How the card looks: a ready-made design, or its colour, light or dark, cover, layout and buttons. */
export function DesignTab({ look, onLook }: { look: Look; onLook: (next: Look) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const set = <K extends keyof Look>(k: K, v: Look[K]) => onLook({ ...look, [k]: v });

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.templates')}</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
          {TEMPLATES.map((tpl) => {
            const on = look.templateId === tpl.id;
            const dark = tpl.mode === 'dark';
            return (
              <Pressable
                key={tpl.id}
                onPress={() => onLook({ ...look, templateId: tpl.id, accent: tpl.accent, mode: tpl.mode, cover: templateCover(tpl) })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={tpl.name}
                style={{ width: 92, gap: 6 }}
              >
                <View
                  style={{
                    height: 116,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                    backgroundColor: dark ? '#141416' : '#FFFFFF',
                    borderWidth: on ? 2 : StyleSheet.hairlineWidth,
                    borderColor: on ? c.accent : c.lineStrong,
                  }}
                >
                  <View style={{ height: 40 }}>
                    <CoverArt cover={templateCover(tpl)} accent={tpl.accent} id={`tpl-${tpl.id}`} />
                  </View>
                  <View style={{ padding: 8, gap: 5 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, marginTop: -20, backgroundColor: tpl.accent, borderWidth: 2, borderColor: dark ? '#141416' : '#FFFFFF' }} />
                    <View style={{ height: 5, width: 50, borderRadius: 3, backgroundColor: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }} />
                    <View style={{ height: 4, width: 36, borderRadius: 2, backgroundColor: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)' }} />
                    <View style={{ height: 10, borderRadius: 3, backgroundColor: tpl.accent, opacity: 0.9, marginTop: 4 }} />
                  </View>
                </View>
                <Text size="xs" weight={on ? 'semibold' : 'regular'} tone={on ? 'ink' : 'muted'} numberOfLines={1} style={{ textAlign: 'center' }}>
                  {tpl.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.accent')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SWATCHES.map((hex) => {
            const on = look.accent.toLowerCase() === hex;
            return (
              <Pressable
                key={hex}
                onPress={() => set('accent', hex)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={hex}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
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
        <Segmented value={look.mode} onChange={(v) => set('mode', v)} options={MODES.map((m) => ({ value: m, label: t(`editor.modes.${m}`) }))} />
        {look.mode === 'auto' ? (
          <Text size="xs" tone="faint" style={{ paddingHorizontal: 4 }}>
            {t('editor.modeAutoHint')}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.coverStyle')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {COVERS.map((cov) => {
            const on = look.cover === cov;
            return (
              <Pressable key={cov} onPress={() => set('cover', cov)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ width: '30%', gap: 4 }}>
                <View style={{ height: 52, borderRadius: radius.md, overflow: 'hidden', borderWidth: on ? 2 : StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.lineStrong }}>
                  <CoverArt cover={cov} accent={look.accent} id={`cov-${cov}`} />
                </View>
                <Text size="xs" tone={on ? 'ink' : 'muted'} weight={on ? 'semibold' : 'regular'} style={{ textAlign: 'center' }}>
                  {t(`editor.covers.${cov}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text size="xs" tone="faint" style={{ paddingHorizontal: 4 }}>
          {t('editor.coverPhotoWins')}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.layout')}</SectionTitle>
        <Segmented value={look.layout} onChange={(v) => set('layout', v)} options={LAYOUTS.map((l) => ({ value: l, label: t(`editor.layouts.${l}`) }))} />
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.linkStyle')}</SectionTitle>
        <Segmented value={look.links} onChange={(v) => set('links', v)} options={LINK_STYLES.map((s) => ({ value: s, label: t(`editor.linkStyles.${s}`) }))} />
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.cardLanguage')}</SectionTitle>
        <Segmented
          value={look.lang}
          onChange={(v) => set('lang', v)}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ar', label: 'العربية' },
          ]}
        />
      </View>

      <Card padded={false}>
        <ToggleRow title={t('editor.brand')} hint={t('editor.brandHint')} value={look.brand} onChange={(v) => set('brand', v)} />
        <Divider />
        <ToggleRow title={t('editor.openInApp')} hint={t('editor.openInAppHint')} value={look.openInApp} onChange={(v) => set('openInApp', v)} />
      </Card>
    </View>
  );
}
