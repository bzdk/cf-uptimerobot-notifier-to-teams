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
        url: "https://example.com",
        previousStatus: 2,
        previousStatusText: "up",
        currentStatus: 9,
        currentStatusText: "down",
        changedAt: "2026-04-04T00:01:00.000Z",
        kind: "incident",
      },
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledWith(
      "https://example.invalid/webhook",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      }),
    )

    const requestOptions = fetcher.mock.calls[0][1]
    const payload = JSON.parse(requestOptions.body as string)
    const bodyText = JSON.stringify(payload)

    expect(bodyText).toContain("UptimeRobot Monitor Down")
    expect(bodyText).toContain("API")
    expect(bodyText).toContain("https://example.com")
    expect(bodyText).toContain("2026-04-04 08:01:00 CST")
  })

  it("throws on webhook errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 }))

    await expect(
      sendTeamsNotification(
        "https://example.invalid/webhook",
        {
          monitorId: "1",
          name: "API",
          previousStatus: 9,
          previousStatusText: "down",
          currentStatus: 2,
          currentStatusText: "up",
          changedAt: "2026-04-04T00:01:00.000Z",
          kind: "recovery",
        },
        fetcher,
      ),
    ).rejects.toThrow("Teams webhook request failed with status 502")
  })
})
