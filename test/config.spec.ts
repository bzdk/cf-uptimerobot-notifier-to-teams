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
    expect(config.manualTriggerToken).toBeUndefined()
    expect(config.logLevel).toBe("info")
  })

  it("throws when a required value is missing", () => {
    expect(() =>
      readConfig({
        UPTIMEROBOT_API_URL: "https://api.uptimerobot.com/v2/getMonitors",
        TEAMS_WEBHOOK_URL: "https://example.invalid/webhook",
      } as any),
    ).toThrow("Missing required env var: UPTIMEROBOT_API_KEY")
  })
})
