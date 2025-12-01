import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { CalDAVAccount } from "../index.js"
import { expandRecurringEvents } from "../utils/recurrence.js"

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message:
    "Invalid date string. Use ISO 8601 format like 2025-11-27 or 2025-11-27T00:00:00Z",
})

function findAccountForCalendarUrl(
  accounts: CalDAVAccount[],
  calendarUrl: string,
): CalDAVAccount | undefined {
  return accounts.find((account) =>
    account.calendars.some((c) => c.url === calendarUrl),
  )
}

export function registerListEvents(
  accounts: CalDAVAccount[],
  server: McpServer,
) {
  server.tool(
    "list-events",
    "List all events between start and end date in the calendar specified by its URL. If end is not provided, defaults to 30 days after start. Recurring events are expanded to show actual occurrences within the date range.",
    {
      calendarUrl: z.string().describe("The calendar URL from list-calendars"),
      start: dateString.describe(
        "Start date in ISO 8601 format (e.g., 2025-11-27 or 2025-11-27T00:00:00Z)",
      ),
      end: dateString
        .nullable()
        .optional()
        .describe(
          "End date in ISO 8601 format. If not provided or null, defaults to 30 days after start",
        ),
    },
    async ({ calendarUrl, start, end }) => {
      console.log(
        `[list-events] Request: calendarUrl="${calendarUrl}", start="${start}", end="${end}"`,
      )
      console.log(
        `[list-events] Available calendars:`,
        accounts.flatMap((a) => a.calendars.map((c) => `${a.name}: ${c.url}`)),
      )

      const account = findAccountForCalendarUrl(accounts, calendarUrl)
      if (!account) {
        console.log(`[list-events] ERROR: No account found for calendar URL`)
        return {
          content: [
            {
              type: "text",
              text: `Error: No account found for calendar URL: ${calendarUrl}. Available URLs: ${accounts.flatMap((a) => a.calendars.map((c) => c.url)).join(", ")}`,
            },
          ],
          isError: true,
        }
      }

      console.log(`[list-events] Found account: ${account.name}`)

      try {
        const startDate = new Date(start)
        // Default end to 30 days after start if not provided
        const endDate = end
          ? new Date(end)
          : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000)

        const options = {
          start: startDate,
          end: endDate,
        }
        console.log(`[list-events] Fetching events with options:`, options)

        const allEvents = await account.client.getEvents(calendarUrl, options)
        console.log(
          `[list-events] Found ${allEvents.length} events from CalDAV`,
        )

        const expandedEvents = expandRecurringEvents(
          allEvents,
          startDate,
          endDate,
        )
        console.log(
          `[list-events] Expanded to ${expandedEvents.length} event occurrences`,
        )

        const data = expandedEvents.map((e) => ({
          summary: e.summary,
          start: e.start,
          end: e.end,
          isRecurring: e.isRecurring,
          ...(e.isRecurring && {
            originalStart: e.originalStart,
            originalEventUid: e.originalEventUid,
          }),
        }))
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        }
      } catch (error) {
        console.log(`[list-events] ERROR:`, error)
        return {
          content: [
            {
              type: "text",
              text: `Error fetching events: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        }
      }
    },
  )
}
