import { appRoute } from '@/lib/links';

/**
 * A link that opened the app (a website address the app claims, or its own
 * vertexconnect:// scheme) becomes the screen it is about.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return appRoute(path) ?? '/';
}
