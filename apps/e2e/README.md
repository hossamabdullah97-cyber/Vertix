# Browser tests

The whole product in a real browser: the API, the web app and a Postgres
database together, driven by [Playwright](https://playwright.dev). They run on
every pull request (the `e2e` job in `.github/workflows/ci.yml`); a failure
keeps its report, screenshots and traces as the `e2e-report` artifact.

## What they cover

| File | |
| --- | --- |
| `auth.spec.ts` | Signing up, signing in, a wrong password in English and Arabic |
| `card-to-lead.spec.ts` | A visitor sends their details from a card; the owner finds the lead. Unpublished cards stay hidden |
| `two-step.spec.ts` | Turning on two-step verification, then signing in with a recovery code and with an app code |
| `meet.spec.ts` | "Met someone": the QR code, taking a number, the WhatsApp link |
| `duplicates.spec.ts` | One person entered twice is found and merged |
| `goals.spec.ts` | A team goal set from the dashboard counts the week's leads |
| `offline.spec.ts` | Without a signal: a card opened once opens again, its contact saves, a visitor's details wait and arrive once back online; "Met someone" still shows the QR code and keeps a number taken offline |
| `pages.spec.ts` | Every main page opens without errors, in English and in Arabic on a phone (right-to-left, no untranslated keys, no sideways scrolling) |

Every test starts its own account through the API and closes it at the end,
so tests never depend on one another or on the demo data.

## Running them locally

With the database, the API (`apps/api`, port 4000) and the web app
(`apps/web`, port 3000) running, from the repository root:

```sh
pnpm e2e
```

The running servers are used as they are. With `CI=1`, Playwright starts the
API and the web app from their production builds itself (`pnpm build` first).
A failing test leaves a trace: `pnpm --filter @vertex/e2e exec playwright show-trace <path>`.
