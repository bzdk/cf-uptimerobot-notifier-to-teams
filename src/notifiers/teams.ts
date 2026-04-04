import type { StatusChangeEvent } from "../types"

type Fetcher = typeof fetch
const BEIJING_TIME_ZONE = "Asia/Shanghai"

function formatChangedAt(changedAt: string): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })

  return `${formatter.format(new Date(changedAt)).replace(" ", " ")} CST`
}

function getNotificationTitle(kind: StatusChangeEvent["kind"]): string {
  if (kind === "incident") {
    return "UptimeRobot Monitor Down"
  }

  if (kind === "recovery") {
    return "UptimeRobot Monitor Recovered"
  }

  return "UptimeRobot Monitor Status Changed"
}

function buildPayload(event: StatusChangeEvent): string {
  return JSON.stringify({
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              weight: "Bolder",
              size: "Medium",
              text: getNotificationTitle(event.kind),
            },
            {
              type: "TextBlock",
              text: `Monitor: ${event.name}`,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `URL: ${event.url ?? "N/A"}`,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `Status: ${event.previousStatusText} -> ${event.currentStatusText}`,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: `Changed At: ${formatChangedAt(event.changedAt)}`,
              wrap: true,
            },
          ],
        },
      },
    ],
  })
}

export async function sendTeamsNotification(
  webhookUrl: string,
  event: StatusChangeEvent,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: buildPayload(event),
  })

  if (!response.ok) {
    throw new Error(`Teams webhook request failed with status ${response.status}`)
  }
}
