# Vertex Connect for Zapier

The Vertex Connect app on Zapier's platform. With it, Zaps can:

- **start** from a new lead, a meeting or quote request, a saved contact or a card view (REST hooks: Zapier subscribes and unsubscribes by itself);
- **add** leads, notes or activities on a lead, and tasks.

It signs in with a workspace **API key** (Integrations › API keys) holding `crm:read`, `crm:write`, `integration:read` and `integration:write`.

Until the app is published, Zaps can already start from Vertex with Zapier's own "Webhooks by Zapier" app: see Integrations › Zapier in Vertex.

## Publish

```bash
npm install -g zapier-platform-cli
cd apps/zapier
npm install
zapier login
zapier register "Vertex Connect"          # once
zapier env:set 1.0.0 VERTEX_API_URL=https://api.your-domain.com/api
zapier push
```

Then invite people from the Zapier developer platform, or submit the app for the public directory. Put the app's invite link in the web app's `NEXT_PUBLIC_ZAPIER_APP_URL`, so Integrations › Zapier links to it.

## Test

```bash
node --test apps/zapier/test/*.test.js
```

The tests stand in for Zapier's `z` object, so they need nothing installed.

## What it calls

| | |
|---|---|
| `GET /zapier/me` | Tests the key, names the connection after the workspace |
| `POST /zapier/hooks` `{ hookUrl, event }` | A Zap turned on |
| `DELETE /zapier/hooks/:id` | A Zap turned off |
| `GET /zapier/samples/:event` | Examples to map fields from |
| `POST /leads`, `POST /leads/:id/activities`, `POST /tasks` | The actions |
