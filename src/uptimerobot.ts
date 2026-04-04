import type { AppConfig, UptimeRobotMonitor } from "./types"

type Fetcher = typeof fetch

type UptimeRobotResponse = {
  stat: string
  monitors?: UptimeRobotMonitor[]
}

export async function fetchMonitors(
  config: AppConfig,
  fetcher: Fetcher = fetch,
): Promise<UptimeRobotMonitor[]> {
  const body = new URLSearchParams({
    api_key: config.apiKey,
    format: "json",
  })

  const response = await fetcher(config.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`UptimeRobot request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as UptimeRobotResponse

  if (payload.stat !== "ok" || !Array.isArray(payload.monitors)) {
    throw new Error("UptimeRobot response did not contain a monitors array")
  }

  return payload.monitors
}
