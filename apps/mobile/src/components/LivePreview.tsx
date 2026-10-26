import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import type { LiveCard } from '@/lib/card-draft';
import { WEB_BASE } from '@/lib/config';
import { useColors } from '@/lib/theme';
import { sessionScript } from '@/lib/web-session';

/**
 * The card drawn by the website itself (/preview/<id>), so it is exactly what
 * visitors see. Given `live`, it shows that instead of the saved card and
 * follows each change as it is typed: the page takes it from
 * window.__vertexPreview (or __vertexPreviewPending, before it is ready).
 */
export function LivePreview({ cardId, live, interactive = false, style }: { cardId: string; live?: LiveCard | null; interactive?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const ref = useRef<WebView>(null);
  const [script, setScript] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const payload = live ? JSON.stringify(live) : null;
  const first = useRef(payload);

  useEffect(() => {
    void sessionScript().then(setScript);
  }, []);

  useEffect(() => {
    if (loaded && payload) ref.current?.injectJavaScript(`window.__vertexPreviewPending=${payload};window.__vertexPreview&&window.__vertexPreview(${payload});true;`);
  }, [loaded, payload]);

  const url = `${WEB_BASE}/preview/${cardId}${live !== undefined ? '?live=1' : ''}`;
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: c.surface }, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      {script ? (
        <WebView
          ref={ref}
          source={{ uri: url }}
          // The first copy goes in before the page loads, so it never shows the card without the edits.
          injectedJavaScriptBeforeContentLoaded={`${script}\n${first.current ? `window.__vertexPreviewPending=${first.current};` : ''}true;`}
          onLoadEnd={() => setLoaded(true)}
          scrollEnabled={interactive}
          showsVerticalScrollIndicator={false}
          sharedCookiesEnabled
          style={{ flex: 1, backgroundColor: 'transparent' }}
          onShouldStartLoadWithRequest={(req) => {
            // The preview itself only: a tapped link opens in the browser.
            if (req.url === 'about:blank' || req.url.startsWith(`${WEB_BASE}/preview/`)) return true;
            if (interactive) void WebBrowser.openBrowserAsync(req.url);
            return false;
          }}
        />
      ) : null}
      {!loaded && <ActivityIndicator style={{ position: 'absolute', top: 40, alignSelf: 'center' }} color={c.accent} />}
    </View>
  );
}
