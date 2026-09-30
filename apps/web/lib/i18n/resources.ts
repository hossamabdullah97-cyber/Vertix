/**
 * Every namespace JSON in the i18next `resources` shape. The languages live in
 * ./messages/{en,ar}.ts: the server passes the page only the one it is shown
 * in (see the root layout), and the other is fetched on a switch. Missing
 * files still fail loudly at build time.
 *
 * When you add a namespace to NAMESPACES in ./config, add it to both files in
 * ./messages.
 */
import type { Resource } from 'i18next';
import en from './messages/en';
import ar from './messages/ar';

/** Both languages together, for code that runs on the server (and tests). */
export const resources: Resource = { en, ar };

/** One language's namespaces, as the server hands them to the page. */
export type Messages = typeof en;
