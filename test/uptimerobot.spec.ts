import { describe, expect, it, vi } from "vitest"
import { fetchMonitors } from "../src/uptimerobot"

describe("fetchMonitors", () => {
  it("returns monitors from a successful API response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          stat: "ok",
          monitors: [{ id: 1, friendly_name: "API", status: 2 }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    )

    const monitors = await fetchMonitors(
      {
        apiKey: "key",
        apiUrl: "https://api.uptimerobot.com/v2/getMonitors",
        teamsWebhookUrl: "https://example.invalid/webhook",
        notifyOnNonUpTransitions: true,
        logLevel: "info",
      },
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.uptimerobot.com/v2/getMonitors",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
      }),
    )

    const requestOptions = fetcher.mock.calls[0][1]
    const body = requestOptions.body as URLSearchParams

    expect(body.get("api_key")).toBe("key")
    expect(body.get("format")).toBe("json")
    expect(monitors).toEqual([{ id: 1, friendly_name: "API", status: 2 }])
  })

  it("throws on non-ok responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 }))

    await expect(
      fetchMonitors(
        {
          apiKey: "key",
          apiUrl: "https://api.uptimerobot.com/v2/getMonitors",
          teamsWebhookUrl: "https://example.invalid/webhook",
          notifyOnNonUpTransitions: true,
          logLevel: "info",
        },
        fetcher,
      ),
    ).rejects.toThrow("UptimeRobot request failed with status 502")
  })
})
