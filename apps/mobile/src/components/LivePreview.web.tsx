import { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { LiveCard } from '@/lib/card-draft';
import { WEB_BASE } from '@/lib/config';

/** The browser build (previews and tests): the same page in a frame, sent each change by message. */
export function LivePreview({ cardId, live, interactive = false, style }: { cardId: string; live?: LiveCard | null; interactive?: boolean; style?: StyleProp<ViewStyle> }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded || !live) return;
    const send = () => frame.current?.contentWindow?.postMessage({ type: 'vertex-preview', live }, '*');
    send();
    // The page listens once React has started, which can be after its load event.
    const later = [setTimeout(send, 400), setTimeout(send, 1500)];
    return () => later.forEach(clearTimeout);
  }, [loaded, live]);

  return (
    <View style={[{ overflow: 'hidden' }, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <iframe
        ref={frame}
        title="card"
        onLoad={() => setLoaded(true)}
        src={`${WEB_BASE}/preview/${cardId}${live !== undefined ? '?live=1' : ''}`}
        style={{ border: 0, width: '100%', height: '100%' }}
      />
    </View>
  );
}
