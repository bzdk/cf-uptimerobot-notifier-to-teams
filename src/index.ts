import { readConfig } from "./config"
import { diffSnapshots, normalizeMonitors } from "./monitor-state"
import { sendTeamsNotification as sendTeamsNotificationDefault } from "./notifiers/teams"
import {
  buildDedupeKey,
  hasSeenTransition,
  markTransitionSent,
  readLatestSnapshot,
  writeLatestSnapshot,
} from "./storage"
import type {
  AppConfig,
  Env,
  ScheduledEvent,
  StatusChangeEvent,
  UptimeRobotMonitor,
} from "./types"
import { fetchMonitors as fetchMonitorsDefault } from "./uptimerobot"

type PollingDeps = {
  fetchMonitors?: (
    config: AppConfig,
    fetcher?: typeof fetch,
  ) => Promise<UptimeRobotMonitor[]>
  sendTeamsNotification?: (
    webhookUrl: string,
    event: StatusChangeEvent,
    fetcher?: typeof fetch,
  ) => Promise<void>
  now?: () => string
}

type RequestDeps = {
  runPollingCycle?: (env: Env) => Promise<void>
}

const DEDUPE_TTL_SECONDS = 15 * 60

export async function runPollingCycle(
  env: Env,
  deps: PollingDeps = {},
): Promise<void> {
  const config = readConfig(env)
  const fetchMonitors = deps.fetchMonitors ?? fetchMonitorsDefault
  const sendTeamsNotification = deps.sendTeamsNotification ?? sendTeamsNotificationDefault
  const fetchedAt = deps.now?.() ?? new Date().toISOString()
  const monitors = await fetchMonitors(config)
  const snapshot = normalizeMonitors(monitors, fetchedAt)
  const previousSnapshot = await readLatestSnapshot(env.MONITOR_SNAPSHOT_KV)
  const events = diffSnapshots(previousSnapshot, snapshot, config.notifyOnNonUpTransitions)
  const dedupeKeysToPersist: string[] = []

  for (const event of events) {
    const dedupeScope = previousSnapshot?.fetchedAt ?? "unknown"
    const dedupeKey = buildDedupeKey(
      event.monitorId,
      event.previousStatus,
      event.currentStatus,
      dedupeScope,
    )

    if (await hasSeenTransition(env.MONITOR_SNAPSHOT_KV, dedupeKey)) {
      continue
    }

    await sendTeamsNotification(config.teamsWebhookUrl, event)
    dedupeKeysToPersist.push(dedupeKey)
  }

  await writeLatestSnapshot(env.MONITOR_SNAPSHOT_KV, snapshot)

  for (const dedupeKey of dedupeKeysToPersist) {
    await markTransitionSent(env.MONITOR_SNAPSHOT_KV, dedupeKey, DEDUPE_TTL_SECONDS)
  }
}

export async function handleRequest(
  request: Request,
  env: Env,
  deps: RequestDeps = {},
): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true })
  }

  if (request.method === "POST" && url.pathname === "/run") {
    const authHeader = request.headers.get("authorization")
    const expectedToken = env.MANUAL_TRIGGER_TOKEN

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return new Response("Unauthorized", { status: 401 })
    }

    const run = deps.runPollingCycle ?? ((runtimeEnv: Env) => runPollingCycle(runtimeEnv))
    await run(env)

    return new Response("Accepted", { status: 202 })
  }

  return new Response("Not Found", { status: 404 })
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  },

  async scheduled(_event?: ScheduledEvent, env?: Env): Promise<void> {
    if (!env) {
      return
    }

    await runPollingCycle(env)
  },
}

export default worker
