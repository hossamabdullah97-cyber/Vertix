import { Stack, useLocalSearchParams } from 'expo-router';
import { WebPage } from '@/components/WebPage';

/** A section of the website, opened in the app (analytics, team, settings, …). */
export default function Web() {
  const { path, title } = useLocalSearchParams<{ path?: string; title?: string }>();
  const safe = typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';
  return (
    <>
      <Stack.Screen options={{ title: title ?? '' }} />
      <WebPage path={safe} />
    </>
  );
}
