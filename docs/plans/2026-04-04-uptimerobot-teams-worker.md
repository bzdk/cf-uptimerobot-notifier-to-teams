# UptimeRobot Teams Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript Cloudflare Worker that polls UptimeRobot every minute, detects monitor status changes using Cloudflare KV, and sends incident and recovery notifications to a Microsoft Teams Incoming Webhook.

**Architecture:** The Worker uses a single `scheduled()` job for polling, a minimal `fetch()` handler for health and manual triggering, KV for the latest monitor snapshot plus short dedupe keys, and isolated adapters for UptimeRobot and Teams. The implementation is intentionally narrow so that change detection and notification behavior are easy to verify and later extend.

**Tech Stack:** Cloudflare Workers, TypeScript, Wrangler, Workers KV, Vitest, UptimeRobot `getMonitors`, Microsoft Teams Incoming Webhook

---

### Task 1: Scaffold the Worker project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `src/types.ts`
- Create: `test/worker.spec.ts`

**Step 1: Write the failing test**

Create `test/worker.spec.ts` with a smoke test that imports the Worker module and asserts the `fetch` and `scheduled` handlers exist.

```ts
import worker from "../src"
import { describe, expect, it } from "vitest"

describe("worker entrypoint", () => {
  it("exports fetch and scheduled handlers", () => {
    expect(typeof worker.fetch).toBe("function")
    expect(typeof worker.scheduled).toBe("function")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/worker.spec.ts`
Expected: FAIL because project files and test runner are not configured yet.

**Step 3: Write minimal implementation**

Create:

- `package.json` with `wrangler`, `typescript`, `vitest`, and `@cloudflare/workers-types`
- `tsconfig.json` for TypeScript compilation
- `vitest.config.ts` for Node-based unit tests
- `src/index.ts` exporting placeholder `fetch` and `scheduled`
- `src/types.ts` with placeholder Env and shared types
- `wrangler.toml` with Worker name, main entry, compatibility date, and cron `* * * * *`

Minimal `src/index.ts`:

```ts
const worker = {
  async fetch(): Promise<Response> {
    return new Response("not implemented", { status: 501 })
  },
  async scheduled(): Promise<void> {
    return
  },
}

export default worker
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/worker.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json tsconfig.json wrangler.toml vitest.config.ts src/index.ts src/types.ts test/worker.spec.ts
git commit -m "chore: scaffold cloudflare worker project"
```

### Task 2: Add configuration parsing

**Files:**
- Create: `src/config.ts`
- Create: `test/config.spec.ts`
- Modify: `src/types.ts`

**Step 1: Write the failing test**

Create `test/config.spec.ts` with coverage for required env vars and optional defaults.

```ts
import { describe, expect, it } from "vitest"
import { readConfig } from "../src/config"

describe("readConfig", () => {
  it("reads required values and applies defaults", () => {
    const config = readConfig({
      UPTIMEROBOT_API_KEY: "key",
      UPTIMEROBOT_API_URL: "https://api.uptimerobot.com/v2/getMonitors",
      TEAMS_WEBHOOK_URL: "https://example.invalid/webhook",
    } as any)

    expect(config.notifyOnNonUpTransitions).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/config.spec.ts`
Expected: FAIL because `readConfig` does not exist.

**Step 3: Write minimal implementation**

Create `src/config.ts` with:

- validation for `UPTIMEROBOT_API_KEY`
- validation for `UPTIMEROBOT_API_URL`
- validation for `TEAMS_WEBHOOK_URL`
- optional `MANUAL_TRIGGER_TOKEN`
- optional `LOG_LEVEL`
- boolean parsing for `NOTIFY_ON_NON_UP_TRANSITIONS`

Update `src/types.ts` with a concrete `Env` type including the KV binding.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/config.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/types.ts test/config.spec.ts
git commit -m "feat: add worker configuration parsing"
```

### Task 3: Implement monitor normalization and diffing

**Files:**
- Create: `src/monitor-state.ts`
- Create: `test/monitor-state.spec.ts`
- Modify: `src/types.ts`

**Step 1: Write the failing test**

Create `test/monitor-state.spec.ts` with cases for:

- first-run snapshot normalization
- `up -> down`
- `down -> up`
- `paused -> up`
- deducing `incident`, `recovery`, and `status_change`

```ts
import { describe, expect, it } from "vitest"
import { diffSnapshots, normalizeMonitors } from "../src/monitor-state"

describe("monitor state", () => {
  it("detects an incident when a monitor transitions from up to down", () => {
    const previous = {
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": { id: "1", name: "API", status: 2, statusText: "up" },
      },
    }

    const current = {
      fetchedAt: "2026-04-04T00:01:00.000Z",
      monitors: {
        "1": { id: "1", name: "API", status: 9, statusText: "down" },
      },
    }

    const events = diffSnapshots(previous, current, true)
    expect(events[0]?.kind).toBe("incident")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/monitor-state.spec.ts`
Expected: FAIL because state helpers do not exist.

**Step 3: Write minimal implementation**

Create `src/monitor-state.ts` with:

- `mapStatusCodeToText(status: number)`
- `normalizeMonitors(apiResponse, fetchedAt)`
- `diffSnapshots(previous, current, notifyOnNonUpTransitions)`
- helper logic to skip notifications on first run

Update `src/types.ts` with `MonitorSnapshot`, `SnapshotState`, and `StatusChangeEvent`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/monitor-state.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/monitor-state.ts src/types.ts test/monitor-state.spec.ts
git commit -m "feat: add monitor snapshot diffing"
```

### Task 4: Implement the UptimeRobot client

**Files:**
- Create: `src/uptimerobot.ts`
- Modify: `src/types.ts`
- Create: `test/uptimerobot.spec.ts`

**Step 1: Write the failing test**

Create `test/uptimerobot.spec.ts` asserting the client:

- posts to the configured endpoint
- includes the API key
- parses the monitor array from a successful response
- throws on non-2xx responses

```ts
import { describe, expect, it, vi } from "vitest"
import { fetchMonitors } from "../src/uptimerobot"

describe("fetchMonitors", () => {
  it("returns monitors from a successful API response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ stat: "ok", monitors: [{ id: 1, friendly_name: "API", status: 2 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const monitors = await fetchMonitors(
      {
        apiKey: "key",
        apiUrl: "https://api.uptimerobot.com/v2/getMonitors",
        teamsWebhookUrl: "https://example.invalid/webhook",
        notifyOnNonUpTransitions: true,
      },
      fetcher,
    )

    expect(monitors).toHaveLength(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/uptimerobot.spec.ts`
Expected: FAIL because the client does not exist.

**Step 3: Write minimal implementation**

Create `src/uptimerobot.ts` with:

- form-encoded POST to `getMonitors`
- required parameters `api_key` and `format=json`
- response parsing and defensive validation
- a thin shape mapping that leaves normalization to `monitor-state.ts`

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/uptimerobot.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/uptimerobot.ts src/types.ts test/uptimerobot.spec.ts
git commit -m "feat: add uptimerobot client"
```

### Task 5: Implement the Teams notifier

**Files:**
- Create: `src/notifiers/teams.ts`
- Create: `test/teams.spec.ts`

**Step 1: Write the failing test**

Create `test/teams.spec.ts` asserting the notifier:

- posts JSON to the webhook URL
- includes key event fields in the card body
- throws on HTTP errors

```ts
import { describe, expect, it, vi } from "vitest"
import { sendTeamsNotification } from "../src/notifiers/teams"

describe("sendTeamsNotification", () => {
  it("posts an adaptive card payload", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    await sendTeamsNotification(
      "https://example.invalid/webhook",
      {
        monitorId: "1",
        name: "API",
        previousStatus: 2,
        previousStatusText: "up",
        currentStatus: 9,
        currentStatusText: "down",
        changedAt: "2026-04-04T00:01:00.000Z",
        kind: "incident",
      },
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/teams.spec.ts`
Expected: FAIL because notifier code does not exist.

**Step 3: Write minimal implementation**

Create `src/notifiers/teams.ts` with:

- payload builder for a small Adaptive Card
- color and title selection by event kind
- webhook POST with `content-type: application/json`
- error throw on non-2xx responses

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/teams.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/notifiers/teams.ts test/teams.spec.ts
git commit -m "feat: add teams webhook notifier"
```

### Task 6: Implement KV snapshot and dedupe storage

**Files:**
- Create: `src/storage.ts`
- Create: `test/storage.spec.ts`
- Modify: `src/types.ts`

**Step 1: Write the failing test**

Create `test/storage.spec.ts` to verify:

- snapshot read returns `null` when absent
- snapshot write persists JSON
- dedupe checks return `true` when key exists

```ts
import { describe, expect, it } from "vitest"
import { buildDedupeKey } from "../src/storage"

describe("buildDedupeKey", () => {
  it("uses monitor id and status transition", () => {
    expect(buildDedupeKey("1", 2, 9)).toBe("dedupe:1:2:9")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/storage.spec.ts`
Expected: FAIL because storage helpers do not exist.

**Step 3: Write minimal implementation**

Create `src/storage.ts` with:

- `readLatestSnapshot(kv)`
- `writeLatestSnapshot(kv, snapshot)`
- `buildDedupeKey(monitorId, fromStatus, toStatus)`
- `hasSeenTransition(kv, key)`
- `markTransitionSent(kv, key, ttlSeconds)`

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/storage.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/storage.ts src/types.ts test/storage.spec.ts
git commit -m "feat: add kv snapshot storage helpers"
```

### Task 7: Wire the scheduled polling flow

**Files:**
- Modify: `src/index.ts`
- Create: `test/polling.spec.ts`
- Modify: `src/config.ts`
- Modify: `src/monitor-state.ts`

**Step 1: Write the failing test**

Create `test/polling.spec.ts` covering:

- first run writes snapshot and sends no notifications
- incident run sends one notification and updates snapshot
- Teams failure leaves snapshot untouched

```ts
import { describe, expect, it } from "vitest"

describe("scheduled polling flow", () => {
  it("does not backfill notifications on first run", async () => {
    expect(true).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/polling.spec.ts`
Expected: FAIL because the integration flow is not implemented.

**Step 3: Write minimal implementation**

Update `src/index.ts` to:

- read config from `env`
- fetch monitors from UptimeRobot
- normalize into a snapshot
- read previous snapshot from KV
- compute change events
- skip already-deduped transitions
- send Teams notifications
- write dedupe markers and latest snapshot only after success

Keep the core run logic in a testable helper, for example `runPollingCycle(env, deps)`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/polling.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts src/config.ts src/monitor-state.ts test/polling.spec.ts
git commit -m "feat: add scheduled polling workflow"
```

### Task 8: Add HTTP health and manual trigger support

**Files:**
- Modify: `src/index.ts`
- Create: `test/http.spec.ts`

**Step 1: Write the failing test**

Create `test/http.spec.ts` with coverage for:

- `GET /health` returns 200 and a simple JSON body
- `POST /run` rejects without auth
- `POST /run` accepts correct token and invokes the polling flow

```ts
import { describe, expect, it } from "vitest"

describe("http handlers", () => {
  it("returns ok on /health", async () => {
    expect(true).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/http.spec.ts`
Expected: FAIL because routes are not implemented.

**Step 3: Write minimal implementation**

Update `src/index.ts` to:

- return JSON from `GET /health`
- require bearer token or exact shared secret for `POST /run`
- call the same polling helper used by `scheduled()`

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/http.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts test/http.spec.ts
git commit -m "feat: add health and manual trigger endpoints"
```

### Task 9: Add local developer documentation

**Files:**
- Create: `README.md`

**Step 1: Write the failing test**

This task does not need an automated failing test. Instead, verify the documentation covers setup and local execution.

**Step 2: Run documentation check**

Run: `rg -n "wrangler|UPTIMEROBOT_API_KEY|TEAMS_WEBHOOK_URL|KV" README.md`
Expected: FAIL because `README.md` does not exist.

**Step 3: Write minimal implementation**

Create `README.md` with:

- project purpose
- required Cloudflare resources
- `wrangler.toml` expectations
- local env setup
- how to bind KV
- how to run `wrangler dev --test-scheduled`
- how to test `/health` and `/run`
- how to deploy

**Step 4: Run documentation check to verify it passes**

Run: `rg -n "wrangler|UPTIMEROBOT_API_KEY|TEAMS_WEBHOOK_URL|KV" README.md`
Expected: PASS

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add worker setup and deployment guide"
```

### Task 10: Run full verification

**Files:**
- Modify: none unless verification reveals issues

**Step 1: Run the test suite**

Run: `npm test -- --run`
Expected: PASS

**Step 2: Run TypeScript checking**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Run Wrangler validation**

Run: `npx wrangler deploy --dry-run`
Expected: PASS

**Step 4: Fix any failures**

If any verification step fails, make the minimal required code or config changes and rerun the failed command until it passes.

**Step 5: Commit**

```bash
git add .
git commit -m "chore: verify worker build and tests"
```
