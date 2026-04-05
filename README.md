# UptimeRobot Teams Worker

Cloudflare Worker that polls UptimeRobot every 2 minutes, compares the latest monitor snapshot with the previous state stored in Workers KV, and sends incident and recovery notifications to a Microsoft Teams Incoming Webhook.

## Requirements

- Node.js 20+
- npm
- Cloudflare account with Workers and KV enabled
- UptimeRobot API key
- Microsoft Teams Incoming Webhook URL

## Configuration

The Worker expects these bindings and environment variables:

- `MONITOR_SNAPSHOT_KV`: KV namespace binding for the latest snapshot and dedupe keys
- `UPTIMEROBOT_API_KEY`: UptimeRobot API key
- `UPTIMEROBOT_API_URL`: API endpoint, for example `https://api.uptimerobot.com/v2/getMonitors`
- `TEAMS_WEBHOOK_URL`: Microsoft Teams Incoming Webhook URL
- `NOTIFY_ON_NON_UP_TRANSITIONS`: optional, defaults to `true`
- `LOG_LEVEL`: optional, defaults to `info`
- `MANUAL_TRIGGER_TOKEN`: optional bearer token for `POST /run`

## Wrangler setup

Install dependencies:

```bash
npm install
```

Create a KV namespace:

```bash
npx wrangler kv namespace create MONITOR_SNAPSHOT_KV
```

Add the resulting namespace ID to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MONITOR_SNAPSHOT_KV"
id = "your-kv-namespace-id"
```

Set secrets:

```bash
npx wrangler secret put UPTIMEROBOT_API_KEY
npx wrangler secret put TEAMS_WEBHOOK_URL
npx wrangler secret put MANUAL_TRIGGER_TOKEN
```

For local development, add a `.dev.vars` file:

```dotenv
UPTIMEROBOT_API_KEY=your-key
UPTIMEROBOT_API_URL=https://api.uptimerobot.com/v2/getMonitors
TEAMS_WEBHOOK_URL=https://example.webhook.office.com/webhookb2/...
MANUAL_TRIGGER_TOKEN=secret-token
```

## Local development

Run the unit tests:

```bash
npm test -- --run
```

Start the Worker with scheduled event testing:

```bash
npx wrangler dev --test-scheduled
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Manual trigger:

```bash
curl -X POST http://127.0.0.1:8787/run \
  -H "Authorization: Bearer secret-token"
```

## Deployment

Deploy the Worker:

```bash
npx wrangler deploy
```

The cron schedule is defined in `wrangler.toml` as `*/2 * * * *`, so Cloudflare will trigger the Worker every 2 minutes after deployment.
