# Vertex Connect — Internationalization (i18n)

Centralized, production i18n for the whole app. Two locales today — **English
(`en`, LTR)** and **Arabic (`ar`, RTL)** — and the architecture adds a third
language by editing config + adding a locale folder, with **no app rewrite**.

Stack: **i18next + react-i18next** in **client-provider mode** (no URL-locale
routing), so switching is instant and preserves the route, form state, and
session.

## Architecture

| Concern | Where |
| --- | --- |
| Locales, direction, namespaces, cookie keys | `lib/i18n/config.ts` |
| i18next instance factory (per-request, synchronous) | `lib/i18n/index.ts` |
| Bundled resources (static JSON imports) | `lib/i18n/resources.ts` |
| Provider + `useLocale()` (controls `<html lang/dir>`) | `components/i18n/LanguageProvider.tsx` |
| Language switcher (toggle / segmented) | `components/i18n/LanguageSwitcher.tsx` |
| Direction-aware icons (nav arrows only) | `components/i18n/DirectionalIcon.tsx` |
| Locale-aware dates / numbers / currency / input dir | `lib/format.ts` |
| Translation JSON, one file per module | `locales/<locale>/<namespace>.json` |
| Key validator (CI) | `scripts/i18n-validate.mjs` → `pnpm i18n:validate` |

The initial locale is read from the `vertex_locale` cookie **server-side** in
`app/layout.tsx`, so the first paint already has the right `lang`/`dir`.

## Using translations

```tsx
'use client';
import { useTranslation } from 'react-i18next';

function Example() {
  const { t } = useTranslation('dashboard'); // one namespace
  return <h1>{t('title')}</h1>;               // dashboard.json → "title"
}
```

Multiple namespaces + explicit prefix:

```tsx
const { t } = useTranslation(['auth', 'common']);
t('auth:login.title');
t('common:actions.save');
```

**Rule:** every user-facing string goes through `t()`. Never hardcode UI text.
Do NOT translate developer comments, variable names, DB fields, API endpoints,
or technical identifiers unless they are shown to users.

### Interpolation

```json
{ "greeting": "Welcome back, {{name}}" }
```

```tsx
t('dashboard:greeting', { name: user.name });
```

### Pluralization (i18next native)

```json
{ "leads_one": "{{count}} lead", "leads_other": "{{count}} leads" }
```

```tsx
t('dashboard:leads', { count });
```

## Switching language

```tsx
import { useLocale } from '@/components/i18n/LanguageProvider';
const { locale, dir, setLocale, toggleLocale } = useLocale();
```

Or drop in the ready-made switcher:

```tsx
<LanguageSwitcher />                    {/* compact toggle */}
<LanguageSwitcher variant="segmented" />{/* labelled control (settings) */}
```

## RTL / direction

- The **only** place `<html dir>` is set is the provider — never per page.
- Use **logical Tailwind utilities** (`ms-`, `me-`, `ps-`, `pe-`, `start-`,
  `end-`, `border-s`, `border-e`, `text-start`) — never `ml-/mr-/left/right`.
  The design system already uses these.
- Mirror **only** directional glyphs with `<DirectionalIcon>` (back, next,
  chevrons). Never mirror user/settings/bell/QR/NFC/social/payment/brand icons.
- Force LTR on individual inputs that hold non-linguistic data (URL, email,
  phone, API key, slug) via `dir="ltr"` or `inputDir()` from `lib/format.ts`.

## Dates, numbers, currency

Always format through `lib/format.ts` — never hand-roll per page.

```tsx
import { formatDate, formatNumber, formatCurrency, formatRelativeTime } from '@/lib/format';
formatDate(lead.createdAt, locale);      // "July 15, 2026" / "١٥ يوليو ٢٠٢٦"
formatNumber(1250, locale);              // "1,250" / "١٬٢٥٠"
formatCurrency(500, locale, 'EGP');
formatRelativeTime(event.at, locale);
```

## User-generated content vs UI translation

- **UI translation** → i18next (`locales/*`).
- **User content** (names, titles, bios, CRM notes, card copy…) → stored as
  application data, entered in any language. Never route user content through
  i18next. For content that genuinely needs both languages, store a
  `{ "en": "...", "ar": "..." }` shape — only where it's actually needed.

## Adding a translation

1. Add the key to `locales/en/<namespace>.json`.
2. Add the same key to `locales/ar/<namespace>.json`.
3. Use `t('<namespace>:<key>')`.
4. Run `pnpm i18n:validate` (fails on missing keys or interpolation drift).

## Adding a namespace

1. Create `locales/en/<name>.json` and `locales/ar/<name>.json`.
2. Add `<name>` to `NAMESPACES` in `lib/i18n/config.ts`.
3. Add its two imports + entries in `lib/i18n/resources.ts`.

## Adding a language

1. Add the code to `LOCALES` (and `RTL_LOCALES` if RTL) + a `LOCALE_LABELS`
   entry in `lib/i18n/config.ts`, and a `localeTag` entry in `lib/format.ts`.
2. Create `locales/<code>/*.json` for every namespace.
3. Add its imports to `lib/i18n/resources.ts`. Done — no app changes.

## Migration status

The foundation, tooling, and formatters are complete. String migration proceeds
module by module (`locales/<ns>` filled + components switched to `t()`), tracked
by `pnpm i18n:validate`. Proven end-to-end so far: **common, nav, auth (login)**,
**dashboard**. Remaining namespaces are seeded and follow the identical pattern.
