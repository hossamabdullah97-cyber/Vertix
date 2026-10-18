import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Empty, Field, Icon, Notice, Row, SectionTitle, Sheet, Text, Toggle, ToggleRow } from '@/components/ui';
import {
  brandOf,
  CATEGORIES,
  isDraft,
  isQuick,
  lightness,
  ltr,
  normalizeUrl,
  PLATFORMS,
  valueKey,
  valueOf,
  type Brand,
  type CardAction,
  type Platform,
} from '@/lib/card-editor';
import { currentLang } from '@/lib/i18n';
import { fonts, radius, useColors } from '@/lib/theme';

const label = (b: Pick<Brand, 'en' | 'ar'>) => (currentLang() === 'ar' ? b.ar : b.en);

/** The site's mark on its colour, as the card shows it. */
function BrandBubble({ brand, size = 36 }: { brand: Pick<Brand, 'color' | 'icon'>; size?: number }) {
  const fg = lightness(brand.color) > 0.75 ? '#18181B' : '#FFFFFF';
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: brand.color, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={brand.icon} size={size * 0.5} color={fg} />
    </View>
  );
}

export interface LinkOps {
  add: (p: Platform) => Promise<CardAction | null>;
  patch: (a: CardAction, body: { config?: Record<string, unknown>; isActive?: boolean }) => Promise<void>;
  remove: (a: CardAction) => Promise<void>;
  move: (a: CardAction, dir: -1 | 1) => Promise<void>;
  setPrimary: (a: CardAction, on: boolean) => Promise<void>;
}

/** Everything that can go on a card, grouped as on the website, with a search. */
function PickerSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (p: Platform) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!visible) setQ('');
  }, [visible]);
  const query = q.trim().toLowerCase();
  const list = query ? PLATFORMS.filter((p) => `${p.en} ${p.ar} ${p.key}`.toLowerCase().includes(query)) : PLATFORMS;

  return (
    <Sheet visible={visible} title={t('editor.addTitle')} onClose={onClose} closeLabel={t('common.close')}>
      <Row gap={8} style={{ borderRadius: radius.md, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, paddingHorizontal: 12, minHeight: 46 }}>
        <Icon name="search" size={18} color={c.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('editor.addSearch')}
          placeholderTextColor={c.faint}
          style={{ flex: 1, color: c.ink, fontFamily: fonts.regular, fontSize: 16, textAlign: 'auto' }}
          accessibilityLabel={t('editor.addSearch')}
          autoCorrect={false}
        />
      </Row>
      {CATEGORIES.map((cat) => {
        const items = list.filter((p) => p.category === cat);
        if (!items.length) return null;
        return (
          <View key={cat} style={{ gap: 8 }}>
            <SectionTitle>{t(`editor.categories.${cat}`)}</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {items.map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() => onPick(p)}
                  accessibilityRole="button"
                  testID={`pick-${p.key}`}
                  style={({ pressed }) => ({
                    width: '31.5%',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    borderRadius: radius.lg,
                    backgroundColor: pressed ? c.elevated : c.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: c.lineStrong,
                  })}
                >
                  <BrandBubble brand={p} size={36} />
                  <Text size="xs" weight="medium" numberOfLines={1} style={{ textAlign: 'center' }}>
                    {label(p)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
      {!list.length && <Empty icon="search" title={t('editor.addNone')} />}
    </Sheet>
  );
}

/** One button's details: where it goes, whether it shows, where on the card. */
function LinkSheet({
  action,
  index,
  count,
  ops,
  onClose,
}: {
  action: CardAction | null;
  index: number;
  count: number;
  ops: LinkOps;
  /** `done`: saved or removed here, rather than closed. */
  onClose: (done?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filled when a button opens; its switches saving meanwhile leave what is being typed alone.
  const openId = action?.id;
  useEffect(() => {
    if (!action) return;
    setValue(valueOf(action));
    setMessage(typeof action.config.text === 'string' ? action.config.text : '');
    setError(null);
  }, [openId]);

  if (!action) return null;
  const brand = brandOf(action);
  const key = valueKey(action.type);

  async function run(fn: () => Promise<void>, close = false) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (close) onClose(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (!action || !key) return;
      const v = key === 'url' ? normalizeUrl(value) : value.trim();
      const config: Record<string, unknown> = { ...action.config, [key]: v };
      if (action.type === 'WHATSAPP') config.text = message.trim();
      await ops.patch(action, { config });
    }, true);

  const remove = () =>
    Alert.alert(t('editor.removeLinkTitle'), t('editor.removeLinkBody', { name: label(brand) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('editor.removeLink'), style: 'destructive', onPress: () => void run(() => ops.remove(action), true) },
    ]);

  return (
    <Sheet visible title={label(brand)} onClose={() => onClose()} closeLabel={t('common.close')}>
      <Row gap={12}>
        <BrandBubble brand={brand} size={44} />
        <Text size="sm" tone="muted" style={{ flex: 1 }}>
          {t(`editor.linkHelp.${key ?? 'none'}`)}
        </Text>
      </Row>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {key === 'phone' && (
        <Field label={t('editor.linkPhone')} value={value} onChangeText={setValue} keyboardType="phone-pad" placeholder="+20 100 000 0000" testID="link-value" />
      )}
      {key === 'email' && (
        <Field label={t('editor.linkEmail')} value={value} onChangeText={setValue} keyboardType="email-address" autoCapitalize="none" placeholder="name@company.com" testID="link-value" />
      )}
      {key === 'url' && (
        <Field
          label={t('editor.linkUrl')}
          value={value}
          onChangeText={setValue}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://"
          style={{ textAlign: 'left' }}
          testID="link-value"
        />
      )}
      {action.type === 'WHATSAPP' && (
        <Field label={t('editor.linkMessage')} value={message} onChangeText={setMessage} placeholder={t('editor.linkMessageHint')} multiline style={{ minHeight: 70, paddingTop: 12 }} textAlignVertical="top" />
      )}
      {key && <Button label={t('editor.saveLink')} icon="check" onPress={save} busy={busy} disabled={!value.trim()} testID="link-save" />}

      <Card padded={false}>
        <ToggleRow title={t('editor.linkShown')} hint={t('editor.linkShownHint')} value={action.isActive} onChange={(on) => void run(() => ops.patch(action, { isActive: on }))} disabled={busy} />
        <Divider />
        <ToggleRow
          title={t('editor.linkQuick')}
          hint={t('editor.linkQuickHint')}
          value={isQuick(action)}
          onChange={(on) => void run(() => ops.patch(action, { config: { ...action.config, isQuick: on } }))}
          disabled={busy}
        />
        <Divider />
        <ToggleRow
          title={t('editor.linkPrimary')}
          hint={t('editor.linkPrimaryHint')}
          value={action.config.isPrimary === true}
          onChange={(on) => void run(() => ops.setPrimary(action, on))}
          disabled={busy}
        />
      </Card>

      <Row gap={8}>
        <Button label={t('editor.moveUp')} kind="secondary" icon="chevron-up" small disabled={busy || index === 0} onPress={() => void run(() => ops.move(action, -1))} style={{ flex: 1 }} />
        <Button label={t('editor.moveDown')} kind="secondary" icon="chevron-down" small disabled={busy || index >= count - 1} onPress={() => void run(() => ops.move(action, 1))} style={{ flex: 1 }} />
      </Row>
      <Button label={t('editor.removeLink')} kind="danger" icon="trash" onPress={remove} disabled={busy} />
    </Sheet>
  );
}

/** The card's buttons: calling, WhatsApp, social profiles, links. Each change is saved at once. */
export function LinksTab({ actions, ops }: { actions: CardAction[]; ops: LinkOps }) {
  const { t } = useTranslation();
  const c = useColors();
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The button just added: closed before it was given anywhere to go, it goes again.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const open = actions.find((a) => a.id === openId) ?? null;
  // Up and down move a button within its own group, as the card shows them.
  const openGroup = open ? actions.filter((a) => isQuick(a) === isQuick(open)) : [];
  const groups = useMemo(() => [
    { key: 'quick', list: actions.filter((a) => isQuick(a)) },
    { key: 'links', list: actions.filter((a) => !isQuick(a)) },
  ], [actions]);

  async function pick(p: Platform) {
    setPicking(false);
    setError(null);
    try {
      const made = await ops.add(p);
      // Save contact needs nothing more; anything else asks where it goes.
      if (made && valueKey(made.type)) {
        setJustAdded(made.id);
        setOpenId(made.id);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function close(done?: boolean) {
    const left = open;
    setOpenId(null);
    setJustAdded(null);
    if (!done && left && left.id === justAdded && isDraft(left)) void ops.remove(left).catch((e: Error) => setError(e.message));
  }

  async function toggle(a: CardAction, on: boolean) {
    setBusyId(a.id);
    setError(null);
    try {
      await ops.patch(a, { isActive: on });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {actions.length === 0 ? (
        <Card padded={false}>
          <Empty icon="link" title={t('editor.linksEmpty')} body={t('editor.linksEmptyBody')} action={<Button label={t('editor.addLink')} icon="plus" onPress={() => setPicking(true)} testID="links-add" />} />
        </Card>
      ) : (
        <>
          {groups.map((g) => (
            <View key={g.key} style={{ gap: 8 }}>
              <SectionTitle>{t(`editor.group.${g.key}`)}</SectionTitle>
              <Text size="xs" tone="faint" style={{ paddingHorizontal: 4, marginTop: -4 }}>
                {t(`editor.group.${g.key}Hint`)}
              </Text>
              <Card padded={false}>
                {g.list.length === 0 ? (
                  <Text size="sm" tone="faint" style={{ padding: 16, textAlign: 'center' }}>
                    {t(`editor.group.${g.key}Empty`)}
                  </Text>
                ) : (
                  g.list.map((a, i) => {
                    const brand = brandOf(a);
                    const value = valueOf(a);
                    const draft = isDraft(a);
                    return (
                      <View key={a.id}>
                        {i > 0 && <Divider />}
                        <Pressable
                          onPress={() => setOpenId(a.id)}
                          accessibilityRole="button"
                          testID="link-row"
                          style={({ pressed }) => ({ backgroundColor: pressed ? c.elevated : 'transparent', opacity: a.isActive ? 1 : 0.6 })}
                        >
                          <Row gap={12} style={{ paddingHorizontal: 16, paddingVertical: 10, minHeight: 60 }}>
                            <BrandBubble brand={brand} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text weight="medium" numberOfLines={1}>
                                {label(brand)}
                              </Text>
                              <Text size="sm" tone={draft ? 'warning' : 'muted'} numberOfLines={1}>
                                {draft ? t('editor.linkNotSet') : value ? ltr(value) : t('editor.linkSaveContact')}
                              </Text>
                            </View>
                            <Toggle value={a.isActive} onChange={(on) => void toggle(a, on)} label={t('editor.linkShown')} disabled={busyId === a.id} />
                          </Row>
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </Card>
            </View>
          ))}
          <Button label={t('editor.addLink')} icon="plus" kind="secondary" onPress={() => setPicking(true)} testID="links-add" />
        </>
      )}
      <PickerSheet visible={picking} onClose={() => setPicking(false)} onPick={(p) => void pick(p)} />
      <LinkSheet action={open} index={openGroup.findIndex((a) => a.id === open?.id)} count={openGroup.length} ops={ops} onClose={close} />
    </View>
  );
}
