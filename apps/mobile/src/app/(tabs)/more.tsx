import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Divider, Icon, ListItem, Notice, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { WEB_BASE } from '@/lib/config';
import { currentLang, directionReady, setLang } from '@/lib/i18n';
import { enablePush, pushState, type PushState } from '@/lib/push';
import { pendingCount } from '@/lib/outbox';
import { lockAvailable, lockEnabled, setLockEnabled } from '@/lib/lock';
import { isManager, useSession, type Role } from '@/lib/session';
import { useColors } from '@/lib/theme';

interface Section {
  key: string;
  icon: string;
  path: string;
  /** Who sees it: as on the website's side bar. */
  roles?: Role[];
}

const SECTIONS: Section[] = [
  { key: 'analytics', icon: 'chart-bar', path: '/analytics' },
  { key: 'tasks', icon: 'check', path: '/leads?view=tasks' },
  { key: 'tags', icon: 'tag', path: '/tags' },
  { key: 'team', icon: 'users', path: '/team', roles: ['OWNER', 'ADMIN', 'MANAGER'] },
  { key: 'integrations', icon: 'layers', path: '/integrations', roles: ['OWNER', 'ADMIN'] },
  { key: 'settings', icon: 'settings', path: '/workspace', roles: ['OWNER', 'ADMIN'] },
  { key: 'billing', icon: 'wallet', path: '/billing', roles: ['OWNER'] },
  { key: 'account', icon: 'user', path: '/account' },
];

/** The account, the workspace, the rest of the product (from the website), and signing out. */
export default function More() {
  const { t } = useTranslation();
  const c = useColors();
  const { me, workspace, workspaces, signOut } = useSession();
  const [restart, setRestart] = useState(false);
  const role = workspace?.role ?? me?.role;
  const lang = currentLang();
  const [push, setPush] = useState<PushState>('unavailable');
  const [lock, setLock] = useState<boolean | null>(null);
  useEffect(() => {
    void pushState().then(setPush);
    void lockAvailable().then(async (ok) => setLock(ok ? await lockEnabled() : null));
  }, []);

  async function toggleLock() {
    if (lock === null) return;
    if (await setLockEnabled(!lock, t('lock.prompt'))) setLock(!lock);
  }

  async function switchLang() {
    const next = lang === 'ar' ? 'en' : 'ar';
    await setLang(next);
    setRestart(!directionReady(next));
    // The phone's notifications follow the app's language.
    if (push === 'on') void enablePush(false).catch(() => undefined);
  }

  async function turnOnPush() {
    if (push === 'denied') return void Linking.openSettings();
    setPush(await enablePush(true).catch(() => 'off' as PushState));
  }

  async function confirmSignOut() {
    const waiting = await pendingCount();
    if (Platform.OS === 'web') return void signOut();
    Alert.alert(t('more.signOutTitle'), waiting ? t('offline.signOutLoses', { count: waiting }) : t('more.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen>
      <Card>
        <Row gap={14}>
          <Avatar name={me?.name || me?.email} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size="lg" weight="semibold" numberOfLines={1}>
              {me?.name || me?.email}
            </Text>
            <Text size="sm" tone="muted" numberOfLines={1}>
              {me?.email}
            </Text>
          </View>
        </Row>
      </Card>

      <Card padded={false}>
        <ListItem
          title={workspace?.org.kind === 'PERSONAL' ? t('workspaces.personal') : workspace?.org.name ?? ''}
          subtitle={role ? t(`roles.${role}`) : null}
          leading={<Icon name="briefcase" size={20} color={c.muted} />}
          onPress={workspaces.length > 1 ? () => router.push('/workspaces') : undefined}
        />
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('more.sections')}</SectionTitle>
        <Card padded={false}>
          {SECTIONS.filter((s) => !s.roles || (role && (s.roles.includes(role) || (s.key === 'team' && isManager(role))))).map((s, i) => (
            <View key={s.key}>
              {i > 0 && <Divider />}
              <ListItem
                testID={`more-${s.key}`}
                title={t(`more.items.${s.key}`)}
                leading={<Icon name={s.icon} size={20} color={c.muted} />}
                onPress={() =>
                  s.key === 'tasks' ? router.push('/tasks') : router.push({ pathname: '/web', params: { path: s.path, title: t(`more.items.${s.key}`) } })
                }
              />
            </View>
          ))}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>{t('more.app')}</SectionTitle>
        <Card padded={false}>
          {push !== 'unavailable' && (
            <>
              <ListItem
                title={t('more.push.title')}
                subtitle={t(`more.push.${push}`)}
                leading={<Icon name="bell" size={20} color={c.muted} />}
                trailing={
                  push === 'on' ? undefined : (
                    <Text tone="accent" size="sm" weight="medium">
                      {push === 'denied' ? t('more.push.openSettings') : t('more.push.turnOn')}
                    </Text>
                  )
                }
                onPress={push === 'on' ? undefined : turnOnPush}
                testID="more-push"
              />
              <Divider />
            </>
          )}
          {lock !== null && (
            <>
              <ListItem
                title={t('lock.setting')}
                subtitle={lock ? t('lock.on') : t('lock.off')}
                leading={<Icon name="lock" size={20} color={c.muted} />}
                trailing={
                  <Text tone="accent" size="sm" weight="medium">
                    {lock ? t('lock.turnOff') : t('lock.turnOn')}
                  </Text>
                }
                onPress={toggleLock}
                testID="more-lock"
              />
              <Divider />
            </>
          )}
          <ListItem title={t('more.language')} subtitle={lang === 'ar' ? 'العربية' : 'English'} leading={<Icon name="globe" size={20} color={c.muted} />} trailing={<Text tone="accent" size="sm" weight="medium">{lang === 'ar' ? 'English' : 'العربية'}</Text>} onPress={switchLang} testID="more-language" />
          <Divider />
          <ListItem title={t('more.help')} leading={<Icon name="help" size={20} color={c.muted} />} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/help`)} />
          <Divider />
          <ListItem title={t('more.privacy')} leading={<Icon name="shield" size={20} color={c.muted} />} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/legal/privacy`)} />
        </Card>
        {restart && <Notice>{t('more.restart')}</Notice>}
      </View>

      <Button label={t('more.signOut')} kind="danger" icon="logout" onPress={confirmSignOut} testID="more-sign-out" />
      <Button
        label={t('more.deleteAccount')}
        kind="ghost"
        onPress={() => router.push({ pathname: '/web', params: { path: '/account', title: t('more.deleteAccount') } })}
      />
    </Screen>
  );
}
