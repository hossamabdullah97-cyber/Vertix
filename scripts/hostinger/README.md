# Running Vertex Connect on Hostinger's Node.js web apps

For trying Vertex Connect on Hostinger web hosting (Business plan and up),
where Node.js "Web Apps" build from GitHub. The database lives elsewhere
(Hostinger web hosting has MySQL only): a PostgreSQL from Neon (neon.tech,
free tier) or any other provider.

A production launch is better served by a VPS and `docker-compose.prod.yml`:
web hosting may stop an idle app, which pauses the API's background work
(follow-up reminders, weekly reports) until the next request wakes it.

Two web apps, both from this repository's `master` branch, so each merge
redeploys them:

| | Website | API |
| --- | --- | --- |
| Domain | `app.<your domain>` | `api.<your domain>` |
| Framework preset | Other | Other |
| Node version | 22.x | 22.x |
| Root directory | `./` | `./` |
| Package manager | pnpm | pnpm |
| Build command | `pnpm run hostinger:web` | `pnpm run hostinger:api` |
| Output directory | (empty) | (empty) |
| Entry file | `scripts/hostinger/web.js` | `scripts/hostinger/api.js` |

`build.mjs` installs (with the development tools the build needs) and builds
the one part, with the pnpm that runs it (Hostinger's own pnpm on the PATH is
another major version, which will not stand in for the pinned one), and reads
the variables Hostinger writes to `.env` (`env.cjs`, also used at start); the entry files start it as the Docker images do. The API's
applies pending database migrations first and stops if one fails, with the
reason in the log.

## Environment variables

Hostinger offers every key of `.env.example`: keep only these. A key left
blank counts as not set.

Website (read while building: change one, then build again):

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.<your domain>/api` |

API:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon's connection string (the direct one, not "pooled": migrations need it) |
| `JWT_SECRET` | a long random string |
| `JWT_REFRESH_SECRET` | another long random string |
| `APP_PUBLIC_URL` | `https://app.<your domain>` |
| `CORS_ORIGINS` | `https://app.<your domain>` |
| `TRUST_PROXY` | `1` |
| `INTEGRATION_ENCRYPTION_KEY` | 32 random bytes in base64 (connected apps, webhooks, single sign-on; keep it) |

Later, as needed (see `.env.example`): `RESEND_API_KEY` and `EMAIL_FROM` for
email to anyone but the account owner, `S3_*` (Cloudflare R2) so uploaded
images survive a redeploy, `VAPID_*` for browser notifications,
`GOOGLE_CLIENT_ID` for Google sign-in.

## Checking it

- `https://api.<your domain>/api/health` answers `{"status":"ok","db":"up",…}`.
- `https://app.<your domain>/login` opens, and signing up works.
- A failed build or start: the web app's deployment log names the step and
  the missing variable or error.
