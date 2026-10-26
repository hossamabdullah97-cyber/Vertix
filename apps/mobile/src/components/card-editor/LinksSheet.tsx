import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Empty, Field, Icon, Notice, Row, SectionTitle, Sheet, Text, Toggle, ToggleRow } from '@/components/ui';
import { useCardEditor } from '@/lib/card-draft';
import {
  brandOf,
  CATEGORIES,
  initialConfig,
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
const platform = (key: string) => PLATFORMS.find((p) => p.key === key) as Platform;

/** What most cards carry, one tap away; the rest are under More. */
const QUICK_ADD = ['CALL', 'WHATSAPP', 'EMAIL', 'WEBSITE', 'INSTAGRAM', 'LINKEDIN', 'FACEBOOK'];

/** The site's mark on its colour, as the card shows it. */
export function BrandBubble({ brand, size = 36 }: { brand: Pick<Brand, 'color' | 'icon'>; size?: number }) {
  const fg = lightness(brand.color) > 0.75 ? '#18181B' : '#FFFFFF';
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: brand.color, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={brand.icon} size={size * 0.5} color={fg} />
    </View>
  );
}

/** Where a button goes: the number, the address or the link (and WhatsApp's first message). */
function Destination({
  type,
  value,
  onValue,
  message,
  onMessage,
}: {
  type: CardAction['type'];
  value: string;
  onValue: (v: string) => void;
  message: string;
  onMessage: (v: string) => void;
}) {
  const { t } = useTranslation();
  const key = valueKey(type);
  return (
    <>
      {key === 'phone' && <Field label={t('editor.linkPhone')} value={value} onChangeText={onValue} keyboardType="phone-pad" placeholder="+20 100 000 0000" autoFocus testID="link-value" />}
      {key === 'email' && (
        <Field label={t('editor.linkEmail')} value={value} onChangeText={onValue} keyboardType="email-address" autoCapitalize="none" placeholder="name@company.com" autoFocus testID="link-value" />
      )}
      {key === 'url' && (
        <Field
          label={t('editor.linkUrl')}
          value={value}
          onChangeText={onValue}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://"
          style={{ textAlign: 'left' }}
          autoFocus
          testID="link-value"
        />
      )}
      {type === 'WHATSAPP' && (
        <Field label={t('editor.linkMessage')} value={message} onChangeText={onMessage} placeholder={t('editor.linkMessageHint')} multiline style={{ minHeight: 70, paddingTop: 12 }} textAlignVertical="top" />
      )}
    </>
  );
}

/** The value as stored: a link made whole (https://), anything else trimmed. */
const tidy = (type: CardAction['type'], v: string) => (valueKey(type) === 'url' ? normalizeUrl(v) : v.trim());

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
    <Sheet
      visible={visible}
      title={t('editor.addTitle')}
      onClose={onClose}
      closeLabel={t('common.close')}
      top={
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
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
        </View>
      }
    >
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

/**
 * Adding one button: where it goes first, then "Add to card". Nothing reaches
 * the card until it has somewhere to go (Save contact needs nothing).
 */
function AddSheet({ picked, onClose }: { picked: Platform | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { draft, addAction } = useCardEditor();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const [quick, setQuick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!picked) return;
    const first = initialConfig(picked, draft.identity);
    const key = valueKey(picked.type);
    setValue(key ? String(first[key] ?? '') : '');
    setMessage('');
    setQuick(isQuick({ type: picked.type, config: {} }));
    setError(null);
    // Filled once per pick; what is typed after that stays.
  }, [picked]);

  if (!picked) return null;
  const key = valueKey(picked.type);
  const empty = !!key && (!value.trim() || value.trim() === (picked.initialUrl ?? ''));
  const defaultQuick = isQuick({ type: picked.type, config: {} });

  async function add() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const config: Record<string, unknown> = key ? { [key]: tidy(picked.type, value) } : {};
      if (picked.type === 'WHATSAPP' && message.trim()) config.text = message.trim();
      if (quick !== defaultQuick) config.isQuick = quick;
      await addAction(picked, config);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible title={t('editor.addOne', { name: label(picked) })} onClose={onClose} closeLabel={t('common.close')}>
      <Row gap={12}>
        <BrandBubble brand={picked} size={44} />
        <Text size="sm" tone="muted" style={{ flex: 1 }}>
          {t(`editor.linkHelp.${key ?? 'none'}`)}
        </Text>
      </Row>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Destination type={picked.type} value={value} onValue={setValue} message={message} onMessage={setMessage} />
      <Card padded={false}>
        <ToggleRow title={t('editor.linkQuick')} hint={t('editor.linkQuickHint')} value={quick} onChange={setQuick} />
      </Card>
      <Button label={t('editor.addToCard')} icon="plus" onPress={() => void add()} busy={busy} disabled={empty} testID="link-add" />
    </Sheet>
  );
}

/** One button on the card: where it goes, whether it shows, where on the card, and removing it. */
function EditSheet({ action, onClose }: { action: CardAction | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { patchAction, removeAction, setPrimary } = useCardEditor();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openId = action?.id;

  useEffect(() => {
    if (!action) return;
    setValue(valueOf(action));
    setMessage(typeof action.config.text === 'string' ? action.config.text : '');
    setError(null);
    // Filled when a button opens; its switches saving meanwhile leave what is being typed alone.
  }, [openId]);

  if (!action) return null;
  const brand = brandOf(action);
  const key = valueKey(action.type);
  const changed = !!key && (tidy(action.type, value) !== valueOf(action) || (action.type === 'WHATSAPP' && message.trim() !== (typeof action.config.text === 'string' ? action.config.text : '')));

  async function run(fn: () => Promise<void>, close = false) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (close) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (!action || !key) return;
      const config: Record<string, unknown> = { ...action.config, [key]: tidy(action.type, value) };
      if (action.type === 'WHATSAPP') config.text = message.trim();
      await patchAction(action, { config });
    }, true);

  const remove = () =>
    Alert.alert(t('editor.removeLinkTitle'), t('editor.removeLinkBody', { name: label(brand) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('editor.removeLink'), style: 'destructive', onPress: () => void run(() => removeAction(action), true) },
    ]);

  return (
    <Sheet visible title={label(brand)} onClose={onClose} closeLabel={t('common.close')}>
      <Row gap={12}>
        <BrandBubble brand={brand} size={44} />
        <Text size="sm" tone="muted" style={{ flex: 1 }}>
          {t(`editor.linkHelp.${key ?? 'none'}`)}
        </Text>
      </Row>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Destination type={action.type} value={value} onValue={setValue} message={message} onMessage={setMessage} />
      {key && <Button label={t('editor.saveChanges')} icon="check" onPress={() => void save()} busy={busy} disabled={!value.trim() || !changed} testID="link-save" />}
      <Card padded={false}>
        <ToggleRow title={t('editor.linkShown')} hint={t('editor.linkShownHint')} value={action.isActive} onChange={(on) => void run(() => patchAction(action, { isActive: on }))} disabled={busy} />
        <Divider />
        <ToggleRow
          title={t('editor.linkQuick')}
          hint={t('editor.linkQuickHint')}
          value={isQuick(action)}
          onChange={(on) => void run(() => patchAction(action, { config: { ...action.config, isQuick: on } }))}
          disabled={busy}
        />
        <Divider />
        <ToggleRow title={t('editor.linkPrimary')} hint={t('editor.linkPrimaryHint')} value={action.config.isPrimary === true} onChange={(on) => void run(() => setPrimary(action, on))} disabled={busy} />
      </Card>
      <Button label={t('editor.removeLink')} kind="danger" icon="trash" onPress={remove} disabled={busy} testID="link-remove" />
    </Sheet>
  );
}

/**
 * How people reach the card's owner: add a button in one step (WhatsApp, a
 * number, done), then show, hide, move or change it. Every change is on the
 * card at once.
 */
export function LinksSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const { actions, patchAction, moveAction } = useCardEditor();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<Platform | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = actions.find((a) => a.id === openId) ?? null;
  const groups = [
    { key: 'quick', list: actions.filter((a) => isQuick(a)) },
    { key: 'links', list: actions.filter((a) => !isQuick(a)) },
  ];

  async function act(a: CardAction, fn: () => Promise<void>) {
    setBusyId(a.id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Sheet visible={visible} title={t('editor.sections.links')} onClose={onClose} closeLabel={t('common.close')} doneLabel={t('editor.done')}>
      <Text size="sm" tone="muted">
        {t('editor.linksIntro')}
      </Text>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('editor.addQuick')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_ADD.map((k) => {
            const p = platform(k);
            return (
              <Pressable
                key={k}
                onPress={() => setAdding(p)}
                accessibilityRole="button"
                testID={`quick-${k}`}
                style={({ pressed }) => ({
                  width: '23%',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: radius.lg,
                  backgroundColor: pressed ? c.elevated : c.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: c.lineStrong,
                })}
              >
                <BrandBubble brand={p} size={34} />
                <Text size="xs" weight="medium" numberOfLines={1}>
                  {label(p)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            testID="links-more"
            style={({ pressed }) => ({
              width: '23%',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 10,
              borderRadius: radius.lg,
              backgroundColor: pressed ? c.elevated : c.accentSoft,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.lineStrong,
            })}
          >
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={18} color={c.onAccent} />
            </View>
            <Text size="xs" weight="medium" tone="accent" numberOfLines={1}>
              {t('editor.addMore')}
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {actions.length === 0 ? (
        <Card padded={false}>
          <Empty icon="link" title={t('editor.linksEmpty')} body={t('editor.linksEmptyBody')} />
        </Card>
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: 8 }}>
            <SectionTitle
              action={
                g.list.length > 1 ? (
                  <Pressable onPress={() => setOrdering((o) => !o)} hitSlop={8} accessibilityRole="button" testID={`order-${g.key}`}>
                    <Text size="sm" tone="accent" weight="medium">
                      {ordering ? t('editor.orderDone') : t('editor.order')}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            >
              {t(`editor.group.${g.key}`)}
            </SectionTitle>
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
                        onPress={() => !ordering && setOpenId(a.id)}
                        accessibilityRole="button"
                        testID="link-row"
                        style={({ pressed }) => ({ backgroundColor: pressed && !ordering ? c.elevated : 'transparent' })}
                      >
                        <Row gap={12} style={{ paddingHorizontal: 16, paddingVertical: 10, minHeight: 62, opacity: a.isActive ? 1 : 0.55 }}>
                          <BrandBubble brand={brand} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text weight="medium" numberOfLines={1}>
                              {label(brand)}
                            </Text>
                            <Text size="sm" tone={draft ? 'warning' : 'muted'} numberOfLines={1}>
                              {draft ? t('editor.linkNotSet') : value ? ltr(value) : t('editor.linkSaveContact')}
                            </Text>
                          </View>
                          {ordering ? (
                            <Row gap={4}>
                              <Pressable
                                onPress={() => void act(a, () => moveAction(a, -1))}
                                disabled={i === 0 || busyId === a.id}
                                accessibilityRole="button"
                                accessibilityLabel={t('editor.moveUp')}
                                hitSlop={6}
                                style={{ padding: 8, opacity: i === 0 ? 0.3 : 1 }}
                              >
                                <Icon name="chevron-up" size={20} color={c.ink} />
                              </Pressable>
                              <Pressable
                                onPress={() => void act(a, () => moveAction(a, 1))}
                                disabled={i === g.list.length - 1 || busyId === a.id}
                                accessibilityRole="button"
                                accessibilityLabel={t('editor.moveDown')}
                                hitSlop={6}
                                style={{ padding: 8, opacity: i === g.list.length - 1 ? 0.3 : 1 }}
                              >
                                <Icon name="chevron-down" size={20} color={c.ink} />
                              </Pressable>
                            </Row>
                          ) : (
                            <Toggle value={a.isActive} onChange={(on) => void act(a, () => patchAction(a, { isActive: on }))} label={t('editor.linkShown')} disabled={busyId === a.id} />
                          )}
                        </Row>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </Card>
          </View>
        ))
      )}

      <PickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          // One page slides away before the next slides up (iOS shows one at a time).
          setTimeout(() => setAdding(p), 350);
        }}
      />
      <AddSheet picked={adding} onClose={() => setAdding(null)} />
      <EditSheet action={open} onClose={() => setOpenId(null)} />
    </Sheet>
  );
}
