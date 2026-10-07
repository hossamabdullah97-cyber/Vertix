import { View } from 'react-native';
import { WEB_BASE } from '@/lib/config';

/** The web build (previews and tests) shows the page in a frame. */
export function WebPage({ path }: { path: string }) {
  return (
    <View style={{ flex: 1 }}>
      <iframe title="page" src={`${WEB_BASE}${path}`} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
