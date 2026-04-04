export interface Env {
  MONITOR_SNAPSHOT_KV: KVNamespace
  UPTIMEROBOT_API_KEY: string
  UPTIMEROBOT_API_URL: string
  TEAMS_WEBHOOK_URL: string
  NOTIFY_ON_NON_UP_TRANSITIONS?: string
  LOG_LEVEL?: string
  MANUAL_TRIGGER_TOKEN?: string
}

export type AppConfig = {
  apiKey: string
  apiUrl: string
  teamsWebhookUrl: string
  notifyOnNonUpTransitions: boolean
  logLevel: string
  manualTriggerToken?: string
}

export type MonitorStatusText = "up" | "down" | "paused" | "unknown"

export type UptimeRobotMonitor = {
  id: number | string
  friendly_name: string
  url?: string
  type?: number | string
  status: number
}

export type MonitorSnapshot = {
  id: string
  name: string
  url?: string
  type?: string
  status: number
  statusText: MonitorStatusText
}

export type SnapshotState = {
  fetchedAt: string
  monitors: Record<string, MonitorSnapshot>
}

export type StatusChangeEvent = {
  monitorId: string
  name: string
  url?: string
  previousStatus: number
  previousStatusText: MonitorStatusText
  currentStatus: number
  currentStatusText: MonitorStatusText
  changedAt: string
  kind: "incident" | "recovery" | "status_change"
}

export type ScheduledEvent = {
  cron: string
  scheduledTime: number
}
