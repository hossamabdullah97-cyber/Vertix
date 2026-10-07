import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui';
import { fonts, useColors } from '@/lib/theme';

/** The app's five places: the day, the leads, adding one, the cards, and the rest. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const c = useColors();
  const { bottom } = useSafeAreaInsets();
  const icon = (name: string) => ({ color }: { color: ColorValue }) => <Icon name={name} size={22} color={String(color)} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentText,
        tabBarInactiveTintColor: c.faint,
        // Room for the Arabic font's taller line, so the labels are never cut.
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth, height: 66 + bottom, paddingTop: 4, paddingBottom: bottom + 4 },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 18 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="leads" options={{ title: t('tabs.leads'), tabBarIcon: icon('inbox') }} />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.add'),
          tabBarIcon: () => (
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: -6 }}>
              <Icon name="plus" size={22} color={c.onAccent} />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="cards" options={{ title: t('tabs.cards'), tabBarIcon: icon('grid') }} />
      <Tabs.Screen name="more" options={{ title: t('tabs.more'), tabBarIcon: icon('menu') }} />
    </Tabs>
  );
}
