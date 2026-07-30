# Vertex Connect — Mobile (Expo + native NFC)

React Native app (Expo Router) that reads & **writes** NFC tags natively.
It consumes the same Vertex Connect API as the web app.

> **Standalone package:** this app is intentionally excluded from the pnpm
> workspace (see root `pnpm-workspace.yaml`) because React Native conflicts with
> pnpm's strict `node_modules`. Install it with its own package manager.

## Why native (not the web/PWA)
NFC **writing** and reliable reading require native APIs. Web NFC works only on
Chrome/Android and not at all on iOS — so the native app is a functional
requirement, not a nicety. This uses `react-native-nfc-manager` (CoreNFC on iOS,
Android NFC on Android).

## Screens
- **Sign in** → JWT stored in `expo-secure-store`.
- **Cards** → your cards (from the API). Tap one to program a tag.
- **Program tag** → in a single tap: reads the tag's hardware UID, writes the
  gateway URL (`/api/t/<uid>`) as an NDEF URI, then registers + assigns the tag
  to the card server-side.
- **Scan tag** → reads a tag and resolves it via the public gateway, showing the
  card/primary action with an "Open" button.

## Setup
```bash
cd apps/mobile
npm install                 # use npm/yarn here, NOT pnpm workspace
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your machine's LAN IP
                            # e.g. http://192.168.1.20:4000/api (not localhost)
```

## Run (requires a real device — NFC is not in simulators)
NFC needs a **Dev Client** build (not Expo Go):
```bash
npx expo prebuild           # generates native ios/ android projects
# Android (needs Android Studio / SDK):
npx expo run:android
# iOS (needs macOS + Xcode):
npx expo run:ios
```
Or build in the cloud with **EAS** (works from Windows for both platforms):
```bash
npm i -g eas-cli && eas build --profile development --platform android
```

## Notes
- The API must allow the device's origin; for native fetch there is no CORS,
  but the device must reach the API over the network (same Wi‑Fi + LAN IP).
- iOS background tag reading and `NFCReaderUsageDescription` are configured via
  `app.json` and the `react-native-nfc-manager` config plugin.
