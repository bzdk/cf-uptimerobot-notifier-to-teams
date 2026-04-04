import { describe, expect, it, vi } from "vitest"
import { handleRequest } from "../src/index"
import type { Env } from "../src/types"

function createEnv(): Env {
  return {
    MONITOR_SNAPSHOT_KV: {
      get: vi.fn(),
      put: vi.fn(),
    } as unknown as KVNamespace,
    UPTIMEROBOT_API_KEY: "key",
    UPTIMEROBOT_API_URL: "https://api.uptimerobot.com/v2/getMonitors",
    TEAMS_WEBHOOK_URL: "https://example.invalid/webhook",
    MANUAL_TRIGGER_TOKEN: "secret-token",
  }
}

describe("handleRequest", () => {
  it("returns ok on /health", async () => {
    const response = await handleRequest(
      new Request("https://example.com/health"),
      createEnv(),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it("rejects /run without the correct token", async () => {
    const response = await handleRequest(
      new Request("https://example.com/run", { method: "POST" }),
      createEnv(),
    )

    expect(response.status).toBe(401)
  })

  it("accepts /run with the correct token and invokes the polling flow", async () => {
    const runPollingCycle = vi.fn().mockResolvedValue(undefined)

    const response = await handleRequest(
      new Request("https://example.com/run", {
        method: "POST",
        headers: {
          authorization: "Bearer secret-token",
        },
      }),
      createEnv(),
      {
        runPollingCycle,
      },
    )

    expect(response.status).toBe(202)
    expect(runPollingCycle).toHaveBeenCalledTimes(1)
  })
})
