import type {
  MonitorStatusText,
  SnapshotState,
  StatusChangeEvent,
  UptimeRobotMonitor,
} from "./types"

export function mapStatusCodeToText(status: number): MonitorStatusText {
  if (status === 2) {
    return "up"
  }

  if (status === 8 || status === 9) {
    return "down"
  }

  if (status === 0) {
    return "paused"
  }

  return "unknown"
}

export function normalizeMonitors(
  monitors: UptimeRobotMonitor[],
  fetchedAt: string,
): SnapshotState {
  const normalized = Object.fromEntries(
    monitors.map((monitor) => {
      const id = String(monitor.id)

      return [
        id,
        {
          id,
          name: monitor.friendly_name,
          url: monitor.url,
          type: monitor.type === undefined ? undefined : String(monitor.type),
          status: monitor.status,
          statusText: mapStatusCodeToText(monitor.status),
        },
      ]
    }),
  )

  return {
    fetchedAt,
    monitors: normalized,
  }
}

export function diffSnapshots(
  previous: SnapshotState | null,
  current: SnapshotState,
  notifyOnNonUpTransitions: boolean,
): StatusChangeEvent[] {
  if (!previous) {
    return []
  }

  const events: StatusChangeEvent[] = []

  for (const [monitorId, currentMonitor] of Object.entries(current.monitors)) {
    const previousMonitor = previous.monitors[monitorId]

    if (!previousMonitor || previousMonitor.status === currentMonitor.status) {
      continue
    }

    const previousUp = previousMonitor.statusText === "up"
    const currentUp = currentMonitor.statusText === "up"

    if (!notifyOnNonUpTransitions && !previousUp && !currentUp) {
      continue
    }

    events.push({
      monitorId,
      name: currentMonitor.name,
      url: currentMonitor.url,
      previousStatus: previousMonitor.status,
      previousStatusText: previousMonitor.statusText,
      currentStatus: currentMonitor.status,
      currentStatusText: currentMonitor.statusText,
      changedAt: current.fetchedAt,
      kind: previousUp && !currentUp ? "incident" : !previousUp && currentUp ? "recovery" : "status_change",
    })
  }

  return events
}
