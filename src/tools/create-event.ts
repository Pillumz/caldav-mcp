import { RecurrenceRule } from "ts-caldav"
import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CalDAVAccount } from "../index.js"

const recurrenceRuleSchema = z.object({
  freq: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  interval: z.number().optional(),
  count: z.number().optional(),
  until: z.string().datetime().optional(), // ISO 8601 string
  byday: z.array(z.string()).optional(), // e.g. ["MO", "TU"]
  bymonthday: z.array(z.number()).optional(),
  bymonth: z.array(z.number()).optional(),
})

function findAccountForCalendarUrl(
  accounts: CalDAVAccount[],
  calendarUrl: string,
): CalDAVAccount | undefined {
  return accounts.find((account) =>
    account.calendars.some((c) => c.url === calendarUrl),
  )
}

export function registerCreateEvent(
  accounts: CalDAVAccount[],
  server: McpServer,
) {
  server.tool(
    "create-event",
    "Creates an event in the calendar specified by its URL",
    {
      summary: z.string(),
      start: z.string().datetime(),
      end: z.string().datetime(),
      calendarUrl: z.string(),
      recurrenceRule: recurrenceRuleSchema.optional(),
    },
    async ({ calendarUrl, summary, start, end, recurrenceRule }) => {
      console.log(
        `[create-event] Request: calendar="${calendarUrl}", summary="${summary}", start="${start}", end="${end}"`,
      )
      if (recurrenceRule) {
        console.log(`[create-event] Recurrence rule:`, recurrenceRule)
      }

      const account = findAccountForCalendarUrl(accounts, calendarUrl)
      if (!account) {
        console.log(`[create-event] ERROR: No account found for calendar URL`)
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

      console.log(`[create-event] Found account: ${account.name}`)

      try {
        const event = await account.client.createEvent(calendarUrl, {
          summary: summary,
          start: new Date(start),
          end: new Date(end),
          recurrenceRule: recurrenceRule as RecurrenceRule,
        })
        console.log(`[create-event] Created event with UID: ${event.uid}`)
        return {
          content: [{ type: "text", text: event.uid }],
        }
      } catch (error) {
        console.log(`[create-event] ERROR:`, error)
        return {
          content: [
            {
              type: "text",
              text: `Error creating event: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        }
      }
    },
  )
}
