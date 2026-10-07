# Getting Vertex Connect into the App Store and Google Play

The build itself comes from EAS (README › Builds). This is everything else
the stores ask for, in the order it is needed.

## 1. Accounts (once)

- **Apple Developer Program** (99 USD a year), as an organization if the app
  is published under the company's name (needs a D-U-N-S number).
- **Google Play Console** (25 USD once). A new personal account must run a
  closed test with at least 12 testers for 14 days before production; an
  organization account does not.
- **Expo** account, for EAS builds and push notifications.

## 2. The app's identity

- Bundle id / package: `dev.vertex.connect` (app.json). Change it before the
  first upload if the company wants its own domain in it; it cannot change
  after.
- In Apple Developer › Identifiers, the app id needs: **Push Notifications**,
  **Sign in with Apple**, **Associated Domains**, **NFC Tag Reading**. EAS
  turns these on itself on the first `eas build` when it manages the
  credentials.
- Push on iOS: `eas credentials` › iOS › Push Notifications: let EAS make the
  APNs key. Push on Android: make a Firebase project with an Android app
  `dev.vertex.connect`, put its `google-services.json` in EAS as the file
  variable `GOOGLE_SERVICES_JSON`, and upload its FCM V1 service account key
  in `eas credentials` › Android › Google Service Account › FCM V1.

## 3. The server

In the production `.env` (see `.env.example`):

```
APPLE_CLIENT_IDS=dev.vertex.connect
APPLE_APP_IDS=<Team ID>.dev.vertex.connect
ANDROID_CERT_FINGERPRINTS=<SHA-256 of the app signing key, from Play Console › App integrity>
```

Then check that the website serves them:
`https://<site>/.well-known/apple-app-site-association` and
`https://<site>/.well-known/assetlinks.json`.

## 4. Store listing

**Name:** Vertex Connect
**Category:** Business
**Price:** Free (accounts and plans are on the website; the app sells nothing,
so no in-app purchase is needed)

**Subtitle (iOS, 30 characters)**
- EN: Smart cards. Leads that follow.
- AR: بطاقات ذكية وعملاء لا يضيعون

**Short description (Google Play, 80 characters)**
- EN: Your smart business card, and every lead it brings, in your pocket.
- AR: بطاقتك الذكية وكل عميل جابته، في جيبك.

**Description**

EN:
> Vertex Connect is your digital business card and the place the people you
> meet end up. Share your card by QR code or an NFC chip, and every visitor
> who leaves their details becomes a lead you can follow up.
>
> • Today: who is waiting for your reply, who came back to your card, and
>   your tasks for the day.
> • Leads: call, WhatsApp or email in one tap, move them through your
>   pipeline, write a note, and see everything that happened.
> • Met someone? Add them in seconds, or read their paper card with the
>   camera.
> • Your cards: show the QR code across the table, share the link, or
>   program an NFC chip.
> • Notifications the moment a new lead or meeting request arrives.
> • Arabic and English, light and dark.
>
> The same account as on the Vertex Connect website, with your team's workspace.

AR:
> Vertex Connect هو كارت البيزنس الرقمي بتاعك، والمكان اللي بيتجمع فيه كل
> اللي بتقابلهم. شارك كارتك بكود QR أو بشريحة NFC، وكل زائر يسيب بياناته
> بيبقى عميل تقدر تتابعه.
>
> • اليوم: مين مستني ردك، ومين رجع لكارتك، ومهامك النهارده.
> • العملاء: اتصال أو واتساب أو إيميل بلمسة، وحرّكهم في مراحل البيع، واكتب
>   ملاحظة، وشوف كل اللي حصل.
> • قابلت حد؟ ضيفه في ثواني، أو صوّر كارته الورق والتطبيق يقراه.
> • كروتك: اعرض كود QR، أو شارك الرابط، أو برمج شريحة NFC.
> • إشعار أول ما يوصل عميل جديد أو طلب اجتماع.
> • عربي وإنجليزي، وضع فاتح وغامق.
>
> نفس حسابك على الموقع، مع مساحة عمل فريقك.

**Keywords (iOS, 100 characters):**
`business card,digital card,nfc,qr,crm,leads,networking,بطاقة,كارت,عملاء`

**URLs:** support `https://<site>/help`, privacy policy `https://<site>/legal/privacy`.

**Screenshots:** iPhone 6.9" (1320 × 2868) and 6.5" (1284 × 2778); Android
phone (1080 × 1920 or more), in Arabic and English: Today, Leads, a lead,
Add with the card scan, a card's QR code, More.

## 5. Privacy answers

What the app itself sends to Vertex's servers (the website's own policy covers
the rest):

| Data | Why | Linked to the person | Tracking |
| --- | --- | --- | --- |
| Name, email | The account | Yes | No |
| Contacts the person adds (leads' names, phones, emails) | The app's purpose (CRM) | Yes | No |
| Photos (a paper business card, only when chosen) | Read into a lead, not kept | Yes | No |
| Device push token | Notifications | Yes | No |

- **Apple App Privacy:** Contact Info (name, email), User Content (other user
  content: leads), Identifiers (device ID: push token). None used for
  tracking; no third-party advertising or analytics SDKs.
- **Google Data safety:** collected: personal info (name, email), contacts
  (leads), photos (optional); encrypted in transit (HTTPS); people can ask for
  deletion (in the app: More › Delete account, and on the website).
- **Account deletion** is reachable inside the app (More › Delete account),
  as both stores require.
- **Encryption:** only HTTPS (`ITSAppUsesNonExemptEncryption` is false in
  app.json), so no export compliance documents.

## 6. App review

Give the reviewers a demo account with data (a workspace with a card, a few
leads and a task), and write in the review notes:

> Sign in with the demo account below. NFC chip programming needs a physical
> NTAG chip; without one, the Cards › Read a chip screen shows the NFC prompt.
> Card scanning uses the camera on a paper business card. Accounts are
> created on the website (the app links to it); the app has no purchases.

The usage texts for the camera, photos and NFC are in app.json, in English;
they are shown when the app first asks.

## 7. Releasing

1. `eas build --profile production --platform all`
2. `eas submit --profile production --platform ios`, then in App Store
   Connect: TestFlight for testers, then submit for review.
3. `eas submit --profile production --platform android` (internal testing
   track, as a draft), then promote to closed testing and production in Play
   Console.
4. After release: try a link from an email on a phone with the app (it should
   open the lead), and leave your details on one of your cards from another
   phone (the notification should reach yours, and a tap open the lead).
