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

**Notifications on the lock screen.** The same notifications as in the app
(a new lead, a meeting request, someone back on a card, a lead waiting for a
reply…), in the app's language. A tap opens what it is about, in its
workspace. The app asks once after the first sign-in; More › Notifications on
this phone turns them on later. Signing out stops them on that phone.

**Links open the app.** A link to the website's signed-in pages (from an
email or a message: `/leads?lead=…`, `/notifications`, `/cards/…`) opens the
app on that screen when it is installed. Cards and chips (`/c/…`, `/t/…`)
always open in the browser: they are for the people they are shared with.

**Every way to sign in.** Email and password in the app; Sign in with Apple
on iPhones, when the server has it on; and "Google or company sign-in", which
opens the website's sign-in in the phone's browser sheet (Google, a company's
single sign-on, or any way the website adds later) and comes back signed in.
The website hands the app a one-time code that only this app can use (PKCE):
`/app-login` on the website, `POST /auth/app-handoff` and
`/auth/app-handoff/redeem` on the API.

**Errors are reported.** A screen that fails to draw, or an error nothing
caught, goes to the admin console's Errors tab (source "Phone app") and to
the platform's alert email, as the website's do. The screen offers to try
again instead of going blank.

**Fixes without a store review.** Builds check for an update when they open
(`eas update`), for the same app version.

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

Server side (the root `.env`, see `.env.example`):

| Variable | What |
| --- | --- |
| `APPLE_CLIENT_IDS` | The iOS bundle id (`dev.vertex.connect`): turns on Sign in with Apple. |
| `EXPO_ACCESS_TOKEN` | Only if the Expo project has "enhanced push security" on. |
| `APPLE_APP_IDS` | `<Team ID>.dev.vertex.connect`: the website serves `/.well-known/apple-app-site-association`. |
| `ANDROID_CERT_FINGERPRINTS` | The app signing certificate's SHA-256 (Play Console › App integrity): the website serves `/.well-known/assetlinks.json`. |

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

## Builds (EAS)

`eas.json` has three profiles: `development` (a dev client to install on your
phone), `preview` (an installable build for testers; an APK on Android) and
`production` (for the stores, its build number counted up by EAS).

Once:

```bash
npm i -g eas-cli
eas login
eas init                    # makes the Expo project; put its id in EAS_PROJECT_ID below
```

Each profile reads its variables from EAS (`eas env:create`, or expo.dev ›
Project › Environment variables), for the environments `development`,
`preview` and `production`:

| Variable | Example |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | `https://api.example.com/api` |
| `EXPO_PUBLIC_WEB_URL` | `https://app.example.com` (its host is the one whose links open the app) |
| `EAS_PROJECT_ID` | from `eas init`; push notifications need it |
| `GOOGLE_SERVICES_JSON` | a *file* variable: the Firebase project's `google-services.json`, for notifications on Android |

Then:

```bash
eas build --profile preview --platform android     # an APK to try on a phone
eas build --profile production --platform all
eas submit --profile production --platform ios     # to App Store Connect (TestFlight)
eas submit --profile production --platform android # to Play's internal testing track

# A fix to the app's code (no new native module, same version) to phones already installed:
eas update --channel production --message "What changed"
```

A new native module, permission or app.json change needs a new build (and a
new `version` in app.json, which is what `runtimeVersion` follows).

What the stores need beyond the build (accounts, listing texts in Arabic and
English, privacy answers, review notes): [STORE.md](STORE.md).

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
src/lib/            api + session, web-sign-in, push, links, errors, i18n, theme, format, crm rules (as on the web), cards, chips, nfc
src/locales/        en.json, ar.json
```
