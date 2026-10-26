import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { WEB_BASE } from '@/lib/config';
import { sessionScript } from '@/lib/web-session';
import { useColors } from '@/lib/theme';

/**
 * A page of the website inside the app, already signed in: the app hands the
 * page its session (the same names the site keeps it under) before the page
 * loads, and marks it embedded so the site leaves out its own phone bars.
 * Links to anywhere else open in the browser.
 */
/** On the website itself (its own origin, not just an address that starts the same). */
function sameSite(url: string): boolean {
  try {
    return new URL(url).origin === new URL(WEB_BASE).origin;
  } catch {
    return false;
  }
}

export function WebPage({ path }: { path: string }) {
  const c = useColors();
  const [script, setScript] = useState<string | null>(null);

  useEffect(() => {
    void sessionScript().then(setScript);
  }, []);

  if (!script) return <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <WebView
        source={{ uri: `${WEB_BASE}${path}` }}
        injectedJavaScriptBeforeContentLoaded={script}
        sharedCookiesEnabled
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={{ position: 'absolute', top: 40, alignSelf: 'center' }} color={c.accent} />}
        onShouldStartLoadWithRequest={(req) => {
          // The site stays in the app; everything else opens where it belongs.
          if (req.url === 'about:blank' || sameSite(req.url)) return true;
          void WebBrowser.openBrowserAsync(req.url);
          return false;
        }}
        style={{ flex: 1, backgroundColor: c.canvas }}
      />
    </View>
  );
}
