import { beforeEach, describe, expect, it, vi } from "vitest"
import { runPollingCycle } from "../src/index"
import type { Env, SnapshotState } from "../src/types"

function createKvStub(
  initialSnapshot: SnapshotState | null = null,
  options: { failSnapshotWrite?: boolean } = {},
) {
  let snapshot = initialSnapshot ? JSON.stringify(initialSnapshot) : null
  const dedupe = new Map<string, string>()

  return {
    get: vi.fn(async (key: string) => {
      if (key === "snapshot:latest") {
        return snapshot
      }

      return dedupe.get(key) ?? null
    }),
    put: vi.fn(async (key: string, value: string) => {
      if (key === "snapshot:latest") {
        if (options.failSnapshotWrite) {
          throw new Error("snapshot write failed")
        }

        snapshot = value
        return
      }

      dedupe.set(key, value)
    }),
    readSnapshot: () => (snapshot ? (JSON.parse(snapshot) as SnapshotState) : null),
    readDedupe: (key: string) => dedupe.get(key) ?? null,
  }
}

describe("runPollingCycle", () => {
  const baseEnv = {
    UPTIMEROBOT_API_KEY: "key",
    UPTIMEROBOT_API_URL: "https://api.uptimerobot.com/v2/getMonitors",
    TEAMS_WEBHOOK_URL: "https://example.invalid/webhook",
  } as Omit<Env, "MONITOR_SNAPSHOT_KV"> & { MONITOR_SNAPSHOT_KV?: Env["MONITOR_SNAPSHOT_KV"] }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("does not backfill notifications on first run", async () => {
    const kv = createKvStub()
    const fetchMonitors = vi.fn().mockResolvedValue([{ id: 1, friendly_name: "API", status: 2 }])
    const sendTeamsNotification = vi.fn()

    await runPollingCycle(
      {
        ...baseEnv,
        MONITOR_SNAPSHOT_KV: kv as unknown as KVNamespace,
      } as Env,
      {
        fetchMonitors,
        sendTeamsNotification,
        now: () => "2026-04-04T00:00:00.000Z",
      },
    )

    expect(sendTeamsNotification).not.toHaveBeenCalled()
    expect(kv.readSnapshot()).toEqual({
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 2,
          statusText: "up",
        },
      },
    })
  })

  it("sends one notification and updates the snapshot when a monitor changes", async () => {
    const kv = createKvStub({
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 2,
          statusText: "up",
        },
      },
    })
    const fetchMonitors = vi.fn().mockResolvedValue([{ id: 1, friendly_name: "API", status: 9 }])
    const sendTeamsNotification = vi.fn().mockResolvedValue(undefined)

    await runPollingCycle(
      {
        ...baseEnv,
        MONITOR_SNAPSHOT_KV: kv as unknown as KVNamespace,
      } as Env,
      {
        fetchMonitors,
        sendTeamsNotification,
        now: () => "2026-04-04T00:01:00.000Z",
      },
    )

    expect(sendTeamsNotification).toHaveBeenCalledTimes(1)
    expect(kv.readSnapshot()?.monitors["1"]?.status).toBe(9)
  })

  it("does not update the snapshot when notification delivery fails", async () => {
    const kv = createKvStub({
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 2,
          statusText: "up",
        },
      },
    })
    const fetchMonitors = vi.fn().mockResolvedValue([{ id: 1, friendly_name: "API", status: 9 }])
    const sendTeamsNotification = vi.fn().mockRejectedValue(new Error("webhook failed"))

    await expect(
      runPollingCycle(
        {
          ...baseEnv,
          MONITOR_SNAPSHOT_KV: kv as unknown as KVNamespace,
        } as Env,
        {
          fetchMonitors,
          sendTeamsNotification,
          now: () => "2026-04-04T00:01:00.000Z",
        },
      ),
    ).rejects.toThrow("webhook failed")

    expect(kv.readSnapshot()?.monitors["1"]?.status).toBe(2)
  })

  it("does not persist dedupe markers when snapshot writing fails", async () => {
    const kv = createKvStub(
      {
        fetchedAt: "2026-04-04T00:00:00.000Z",
        monitors: {
          "1": {
            id: "1",
            name: "API",
            status: 2,
            statusText: "up",
          },
        },
      },
      { failSnapshotWrite: true },
    )
    const fetchMonitors = vi.fn().mockResolvedValue([{ id: 1, friendly_name: "API", status: 9 }])
    const sendTeamsNotification = vi.fn().mockResolvedValue(undefined)

    await expect(
      runPollingCycle(
        {
          ...baseEnv,
          MONITOR_SNAPSHOT_KV: kv as unknown as KVNamespace,
        } as Env,
        {
          fetchMonitors,
          sendTeamsNotification,
          now: () => "2026-04-04T00:01:00.000Z",
        },
      ),
    ).rejects.toThrow("snapshot write failed")

    expect(kv.readDedupe("dedupe:1:2:9:2026-04-04T00:00:00.000Z")).toBeNull()
  })

  it("does not suppress a new incident after the monitor has recovered", async () => {
    const kv = createKvStub({
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {
        "1": {
          id: "1",
          name: "API",
          status: 2,
          statusText: "up",
        },
      },
    })
    const sendTeamsNotification = vi.fn().mockResolvedValue(undefined)

    await runPollingCycle(
      {
        ...baseEnv,
        MONITOR_SNAPSHOT_KV: kv as unknown as KVNamespace,
      } as Env,
      {
        fetchMonitors: vi
          .fn()
          .mockResolvedValue([{ id: 1, friendly_name: "API", status: 9 }]),
        sendTeamsNotification,
        now: () => "2026-04-04T00:01:00.000Z",
      },
    )

    await runPollingCycle(
      {
        ...baseEnv,
        MONITOR_SNAPSHOT_KV: kv as unknown as KVNamespace,
      } as Env,
      {
        fetchMonitors: vi
          .fn()
          .mockResolvedValue([{ id: 1, friendly_name: "API", status: 2 }]),
        sendTeamsNotification,
        now: () => "2026-04-04T00:02:00.000Z",
      },
    )

    await runPollingCycle(
      {
        ...baseEnv,
        MONITOR_SNAPSHOT_KV: kv as unknown as KVNamespace,
      } as Env,
      {
        fetchMonitors: vi
          .fn()
          .mockResolvedValue([{ id: 1, friendly_name: "API", status: 9 }]),
        sendTeamsNotification,
        now: () => "2026-04-04T00:03:00.000Z",
      },
    )

    expect(sendTeamsNotification).toHaveBeenCalledTimes(3)
  })
})
