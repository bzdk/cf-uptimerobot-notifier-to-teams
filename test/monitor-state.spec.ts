import { describe, expect, it } from "vitest"
import { diffSnapshots, normalizeMonitors } from "../src/monitor-state"

describe("normalizeMonitors", () => {
  it("normalizes uptime robot monitors into a snapshot", () => {
    const snapshot = normalizeMonitors(
      [
        {
          id: 1,
          friendly_name: "API",
          url: "https://example.com",
          type: 1,
          status: 2,
        },
      ],
      "2026-04-04T00:00:00.000Z",
    )

    expect(snapshot).toEqual({
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          url: "https://example.com",
          type: "1",
          status: 2,
          statusText: "up",
        },
      },
    })
  })
})

describe("diffSnapshots", () => {
  it("returns no events on first run", () => {
    const current = {
      fetchedAt: "2026-04-04T00:01:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 2,
          statusText: "up" as const,
        },
      },
    }

    expect(diffSnapshots(null, current, true)).toEqual([])
  })

  it("detects an incident when a monitor transitions from up to down", () => {
    const previous = {
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 2,
          statusText: "up" as const,
        },
      },
    }

    const current = {
      fetchedAt: "2026-04-04T00:01:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 9,
          statusText: "down" as const,
        },
      },
    }

    expect(diffSnapshots(previous, current, true)).toEqual([
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
    ])
  })

  it("suppresses non-up transitions when the flag is disabled", () => {
    const previous = {
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 8,
          statusText: "down" as const,
        },
      },
    }

    const current = {
      fetchedAt: "2026-04-04T00:01:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 9,
          statusText: "down" as const,
        },
      },
    }

    expect(diffSnapshots(previous, current, false)).toEqual([])
  })

  it("detects a recovery when a monitor transitions from down to up", () => {
    const previous = {
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 9,
          statusText: "down" as const,
        },
      },
    }

    const current = {
      fetchedAt: "2026-04-04T00:01:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 2,
          statusText: "up" as const,
        },
      },
    }

    expect(diffSnapshots(previous, current, true)).toEqual([
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
    ])
  })
})
