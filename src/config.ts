import type { AppConfig, Env } from "./types"

const DEFAULT_LOG_LEVEL = "info"

function requireEnvValue(value: string | undefined, key: keyof Env): string {
  if (!value) {
    throw new Error(`Missing required env var: ${key}`)
  }

  return value
}

export function readConfig(env: Partial<Env>): AppConfig {
  return {
    apiKey: requireEnvValue(env.UPTIMEROBOT_API_KEY, "UPTIMEROBOT_API_KEY"),
    apiUrl: requireEnvValue(env.UPTIMEROBOT_API_URL, "UPTIMEROBOT_API_URL"),
    teamsWebhookUrl: requireEnvValue(env.TEAMS_WEBHOOK_URL, "TEAMS_WEBHOOK_URL"),
    notifyOnNonUpTransitions: env.NOTIFY_ON_NON_UP_TRANSITIONS !== "false",
    logLevel: env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL,
    manualTriggerToken: env.MANUAL_TRIGGER_TOKEN,
  }
}
