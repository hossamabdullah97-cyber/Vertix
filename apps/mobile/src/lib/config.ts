/** Where the app talks to: the API, the web app (for the sections opened from the site) and chips' short address. */
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '');
export const WEB_BASE = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
export const TAP_BASE = (process.env.EXPO_PUBLIC_TAP_URL || WEB_BASE).replace(/\/+$/, '');
