import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CalDAVAccount } from "../index.js"

export async function registerListCalendars(
  accounts: CalDAVAccount[],
  server: McpServer,
) {
  // Use pre-fetched calendars from accounts
  const allCalendars: Array<{ account: string; name: string; url: string }> = []

  for (const account of accounts) {
    for (const cal of account.calendars) {
      allCalendars.push({
        account: account.name,
        name: cal.name,
        url: cal.url,
      })
    }
  }

  server.tool(
    "list-calendars",
    "List all calendars from all configured accounts, returning account name, calendar name, and URL",
    {},
    async () => {
      return {
        content: [
          { type: "text", text: JSON.stringify(allCalendars, null, 2) },
        ],
      }
    },
  )
}
