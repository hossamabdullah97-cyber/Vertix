import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Card, Divider, Icon, ListItem, Screen, Text } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useColors } from '@/lib/theme';

/** Every workspace the person is in: the same ones as on the website. */
export default function Workspaces() {
  const { t } = useTranslation();
  const c = useColors();
  const { workspaces, workspace, switchTo } = useSession();
  return (
    <Screen edges={[]}>
      <Text tone="muted">{t('workspaces.body')}</Text>
      <Card padded={false}>
        {workspaces.map((w, i) => {
          const on = w.org.id === workspace?.org.id;
          const name = w.org.kind === 'PERSONAL' ? t('workspaces.personal') : w.org.name;
          return (
            <View key={w.org.id}>
              {i > 0 && <Divider />}
              <ListItem
                testID="workspace-option"
                title={name}
                subtitle={t(`roles.${w.role}`)}
                leading={<Avatar name={name} size={36} />}
                trailing={on ? <Icon name="check" size={18} color={c.accentText} /> : <View />}
                onPress={async () => {
                  if (!on) await switchTo(w.org.id);
                  router.back();
                }}
              />
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
