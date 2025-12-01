import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CalDAVAccount } from "../index.js"

function findAccountForCalendarUrl(
  accounts: CalDAVAccount[],
  calendarUrl: string,
): CalDAVAccount | undefined {
  return accounts.find((account) =>
    account.calendars.some((c) => c.url === calendarUrl),
  )
}

export function registerDeleteEvent(
  accounts: CalDAVAccount[],
  server: McpServer,
) {
  server.tool(
    "delete-event",
    "Deletes an event in the calendar specified by its URL",
    { uid: z.string(), calendarUrl: z.string() },
    async ({ uid, calendarUrl }) => {
      console.log(
        `[delete-event] Request: uid="${uid}", calendar="${calendarUrl}"`,
      )

      const account = findAccountForCalendarUrl(accounts, calendarUrl)
      if (!account) {
        console.log(`[delete-event] ERROR: No account found for calendar URL`)
        return {
          content: [
            {
              type: "text",
              text: `Error: No account found for calendar URL: ${calendarUrl}`,
            },
          ],
          isError: true,
        }
      }

      console.log(`[delete-event] Found account: ${account.name}`)

      try {
        await account.client.deleteEvent(calendarUrl, uid)
        console.log(`[delete-event] Deleted event: ${uid}`)
        return {
          content: [{ type: "text", text: "Event deleted" }],
        }
      } catch (error) {
        console.log(`[delete-event] ERROR:`, error)
        return {
          content: [
            {
              type: "text",
              text: `Error deleting event: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        }
      }
    },
  )
}
