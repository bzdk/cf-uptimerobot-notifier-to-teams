# UptimeRobot Teams Worker Design

## Goal

Build a Cloudflare Worker that runs every minute, fetches all monitor states from UptimeRobot via `getMonitors`, detects monitor status changes against the previous snapshot stored in Cloudflare KV, and posts incident and recovery notifications to a Microsoft Teams channel via Incoming Webhook.

## Scope

In scope:

- Cloudflare Worker with a `scheduled()` entrypoint
- Cloudflare KV for last-known monitor snapshot and short-lived dedupe keys
- UptimeRobot polling using `getMonitors`
- Microsoft Teams Incoming Webhook notifications
- Manual debug endpoint for health check and authenticated trigger
- Unit tests for normalization, diffing, and notification flow

Out of scope:

- Historical event storage beyond the latest snapshot and short dedupe TTL
- Dashboard or UI
- Multi-channel routing
- Power Automate / Workflow integration

## External Constraints

- UptimeRobot currently documents a newer v3 REST API, but the `getMonitors` method the project is built around is documented in the legacy API. The first implementation will target `getMonitors` because it directly matches the requested polling flow and exposes the monitor status values needed for change detection.
- Cloudflare Workers support minute-level cron triggers through `scheduled()` and Wrangler cron configuration.
- Microsoft Teams Incoming Webhooks accept JSON payloads, including Adaptive Cards, but Microsoft documents a retirement path for Microsoft 365 Connectors. The notifier implementation should therefore be isolated behind a small adapter so a future migration does not affect polling or diff logic.

## Architecture

The project will be a single TypeScript Cloudflare Worker. The worker exposes two entrypoints:

- `scheduled()` for the minute-level polling job
- `fetch()` for a minimal health/debug surface

Core flow:

1. Cron trigger fires every minute.
2. Worker calls UptimeRobot `getMonitors` and retrieves all monitors.
3. Response data is normalized into an internal snapshot shape.
4. Worker reads the previous snapshot from KV.
5. Current snapshot is diffed against the previous snapshot by monitor ID.
6. For each status change, the worker builds a notification event.
7. Events are posted to the configured Teams Incoming Webhook.
8. If event handling succeeds, the worker updates the KV snapshot and dedupe markers.

## Data Model

The worker should normalize upstream responses into stable internal types:

```ts
type MonitorSnapshot = {
  id: string
  name: string
  url?: string
  type?: string
  status: number
  statusText: "up" | "down" | "paused" | "unknown"
}

type SnapshotState = {
  fetchedAt: string
  monitors: Record<string, MonitorSnapshot>
}

type StatusChangeEvent = {
  monitorId: string
  name: string
  url?: string
  previousStatus: number
  previousStatusText: string
  currentStatus: number
  currentStatusText: string
  changedAt: string
  kind: "incident" | "recovery" | "status_change"
}
```

This creates a boundary between third-party payloads and internal logic. Future changes to UptimeRobot or Teams should be isolated to adapters instead of spreading through the codebase.

## Status Mapping

The worker should compare raw numeric statuses first, then derive higher-level semantics:

- `2` => `up`
- `8` or `9` => `down`
- `0` => `paused`
- anything else => `unknown`

Notification semantics:

- `up -> non-up` => `incident`
- `non-up -> up` => `recovery`
- any other numeric change => `status_change`

Default behavior is to notify on every numeric status transition, including non-up to non-up, because the upstream system considers them distinct states. This can be made configurable later if it proves noisy.

## KV Layout

Use Cloudflare KV with two key families:

- `snapshot:latest`
  Stores the latest normalized monitor snapshot as JSON.
- `dedupe:<monitorId>:<fromStatus>:<toStatus>`
  Stores a short-lived marker to reduce duplicate notifications caused by overlapping executions or retried webhook sends.

Recommended dedupe TTL: 10 to 15 minutes.

## Notification Format

Each changed monitor should produce one Teams message. Use a minimal Adaptive Card with:

- title
- monitor name
- URL if available
- previous status
- current status
- timestamp

Presentation rules:

- incidents use red emphasis and direct wording such as `Monitor Down`
- recoveries use green emphasis and direct wording such as `Monitor Recovered`
- other transitions use a neutral or warning style

The Teams sender must be wrapped behind a `Notifier`-style interface so an eventual move from Incoming Webhook to Workflows remains local to the adapter.

## Error Handling

Error handling should preserve alert correctness over minimizing retries:

- If UptimeRobot fetch fails, abort the run and keep the old snapshot.
- If Teams sending fails for any event, log the failure and keep the old snapshot.
- Only write the new full snapshot after all status-change events for the run have been processed successfully.
- Only write dedupe keys for events that were sent successfully.

This favors retryability and avoids silent alert loss. The tradeoff is possible duplicate notifications after partial failure, which dedupe keys reduce.

## Configuration

Required environment variables and bindings:

- `UPTIMEROBOT_API_KEY`
- `UPTIMEROBOT_API_URL`
- `TEAMS_WEBHOOK_URL`
- `MONITOR_SNAPSHOT_KV`

Optional environment variables:

- `NOTIFY_ON_NON_UP_TRANSITIONS` default `true`
- `LOG_LEVEL`
- `MANUAL_TRIGGER_TOKEN`

## HTTP Surface

The `fetch()` handler should stay narrow:

- `GET /health` returns a simple ok payload
- `POST /run` triggers the polling flow for manual verification and requires a bearer token or shared secret

No other public routes are necessary.

## Testing Strategy

Minimum automated coverage:

1. First run with no prior snapshot stores current state and emits no backfilled notifications.
2. `up -> down` transition produces an incident event.
3. `down -> up` transition produces a recovery event.
4. Unknown or paused transitions are handled deterministically.
5. Teams send failure prevents snapshot update.
6. Dedupe key suppresses duplicate sends for the same transition within TTL.

## Suggested Project Layout

```text
src/
  config.ts
  index.ts
  monitor-state.ts
  types.ts
  uptimerobot.ts
  notifiers/
    teams.ts
test/
  config.spec.ts
  monitor-state.spec.ts
  teams.spec.ts
  worker.spec.ts
wrangler.toml
package.json
tsconfig.json
vitest.config.ts
```

## Open Decisions Resolved

- Poll all monitors every minute: yes
- Persist last-known state in Cloudflare KV: yes
- Notify on both incident and recovery: yes
- Send to Teams via Incoming Webhook: yes

## Implementation Direction

Implement the project as a small TypeScript Worker using KV-backed snapshots and a replaceable Teams notifier. Keep the first version intentionally narrow: one scheduled job, one snapshot store, one Teams channel, and no event history beyond what is required for reliable change detection.
