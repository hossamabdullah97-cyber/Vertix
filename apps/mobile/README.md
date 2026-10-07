# Vertex Connect — the phone app (Android and iOS)

The same account as the website, on the phone. What people do away from a
desk is native; everything else opens the website inside the app, already
signed in.

**Native screens**

- **Sign in** — email and password, then the six-digit code when two-step
  verification is on. The session is kept in the phone's secure storage
  (`expo-secure-store`).
- **Today** — who is waiting for a reply, who came back to a card, today's
  tasks, and the notifications bell. Switch workspaces from here.
- **Leads** — search, filters (waiting, came back, hot), and each lead's page:
  call, WhatsApp or email (each one logged), stage, a note, and the history.
- **Add** — the details of someone just met, or read from their paper card
  with the camera (when the server has card reading on).
- **Cards** — each card's QR code to show across a table, its link to share,
  and NFC: program a chip with a card, or read which card a chip opens.
- **Notifications** — opened in the right workspace.
- **More** — analytics, tasks, tags, team, integrations, settings, billing and
  the account, as the website pages (by role, as on the website's side bar);
  language; sign out.

**One account, one session.** The app signs in through the same API as the
website and hands its session to the website pages it opens, so nobody signs in
twice. The website hides its own phone header and bottom bar there. Sessions
the app opens are listed under the account's devices as "Vertex app".

**Arabic and English.** The phone's language is used at first, and can be
changed under More. Arabic lays the app out right to left (on Android and iOS
that takes effect after the app is reopened).

## Setup

The app sits outside the pnpm workspace (React Native and pnpm's strict
`node_modules` do not get along), so it installs with npm:

```bash
cd apps/mobile
npm install
cp .env.example .env
```

`.env`:

| Variable | What |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | The API, e.g. `https://api.example.com/api`. On a phone in development use the computer's LAN address (`http://192.168.1.20:4000/api`), not `localhost`. |
| `EXPO_PUBLIC_WEB_URL` | The website, for the pages opened inside the app and card links. |
| `EXPO_PUBLIC_TAP_URL` | The chips' short address, when it differs from the website. |

Add an Expo dependency with the version Expo pairs with this SDK
(`node_modules/expo/bundledNativeModules.json`, or `npx expo install <name>`).

## Run

NFC and the camera need a development build (not Expo Go):

```bash
npx expo run:android        # Android Studio / SDK
npx expo run:ios            # macOS + Xcode
```

or in the cloud with EAS, from any computer:

```bash
npm i -g eas-cli
eas build --profile development --platform android
```

The screens also run in a browser (`npm run web`); NFC is not available there.
The API must then allow that address in `CORS_ORIGINS`.

## Checks

```bash
npm run typecheck
npm test
npx expo export --platform web   # every screen bundles
```

CI runs all three (the `mobile` job).

## Layout

```
src/app/            screens (Expo Router): login, (tabs)/…, lead/[id], card/[id], chip, notifications, workspaces, web
src/components/     ui.tsx (the design system's pieces), WebPage (the website inside the app)
src/lib/            api + session, i18n, theme, format, crm rules (as on the web), cards, chips, nfc
src/locales/        en.json, ar.json
```
