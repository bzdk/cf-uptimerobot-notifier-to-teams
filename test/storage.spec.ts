import { describe, expect, it, vi } from "vitest"
import {
  buildDedupeKey,
  hasSeenTransition,
  readLatestSnapshot,
  writeLatestSnapshot,
} from "../src/storage"

describe("storage helpers", () => {
  it("builds a dedupe key from monitor id and status transition", () => {
    expect(buildDedupeKey("1", 2, 9, "2026-04-04T00:00:00.000Z")).toBe(
      "dedupe:1:2:9:2026-04-04T00:00:00.000Z",
    )
  })

  it("returns null when the snapshot is absent", async () => {
    const kv = {
      get: vi.fn().mockResolvedValue(null),
    }

    await expect(readLatestSnapshot(kv as any)).resolves.toBeNull()
  })

  it("writes the snapshot JSON payload", async () => {
    const kv = {
      put: vi.fn().mockResolvedValue(undefined),
    }

    const snapshot = {
      fetchedAt: "2026-04-04T00:00:00.000Z",
      monitors: {},
    }

    await writeLatestSnapshot(kv as any, snapshot)

    expect(kv.put).toHaveBeenCalledWith(
      "snapshot:latest",
      JSON.stringify(snapshot),
    )
  })

  it("returns true when a dedupe key already exists", async () => {
    const kv = {
      get: vi.fn().mockResolvedValue("1"),
    }

    await expect(
      hasSeenTransition(kv as any, "dedupe:1:2:9:2026-04-04T00:00:00.000Z"),
    ).resolves.toBe(true)
  })
})
