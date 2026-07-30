import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { getToken } from '@/lib/api';
import { colors } from '@/lib/theme';

export default function Index() {
  const [state, setState] = useState<'loading' | 'in' | 'out'>('loading');

  useEffect(() => {
    getToken().then((t) => setState(t ? 'in' : 'out'));
  }, []);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Redirect href={state === 'in' ? '/cards' : '/login'} />;
}
