import type { SnapshotState } from "./types"

const SNAPSHOT_KEY = "snapshot:latest"

export function buildDedupeKey(
  monitorId: string,
  fromStatus: number,
  toStatus: number,
  snapshotVersion: string,
): string {
  return `dedupe:${monitorId}:${fromStatus}:${toStatus}:${snapshotVersion}`
}

export async function readLatestSnapshot(
  kv: Pick<KVNamespace, "get">,
): Promise<SnapshotState | null> {
  const payload = await kv.get(SNAPSHOT_KEY)

  if (!payload) {
    return null
  }

  return JSON.parse(payload) as SnapshotState
}

export async function writeLatestSnapshot(
  kv: Pick<KVNamespace, "put">,
  snapshot: SnapshotState,
): Promise<void> {
  await kv.put(SNAPSHOT_KEY, JSON.stringify(snapshot))
}

export async function hasSeenTransition(
  kv: Pick<KVNamespace, "get">,
  key: string,
): Promise<boolean> {
  return (await kv.get(key)) !== null
}

export async function markTransitionSent(
  kv: Pick<KVNamespace, "put">,
  key: string,
  ttlSeconds: number,
): Promise<void> {
  await kv.put(key, "1", { expirationTtl: ttlSeconds })
}
