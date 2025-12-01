#!/usr/bin/env node

import "dotenv/config"
import http from "node:http"
import { CalDAVClient } from "ts-caldav"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"

import { registerCreateEvent } from "./tools/create-event.js"
import { registerDeleteEvent } from "./tools/delete-event.js"
import { registerListCalendars } from "./tools/list-calendars.js"
import { registerListEvents } from "./tools/list-events.js"

const PORT = parseInt(process.env.PORT || "8000", 10)
const HOST = process.env.HOST || "0.0.0.0"

export interface CalendarInfo {
  name: string
  url: string
}

export interface CalDAVAccount {
  name: string
  client: CalDAVClient
  baseUrl: string
  calendars: CalendarInfo[] // Calendars belonging to this account
}

function parseAccounts(): Array<{
  name: string
  baseUrl: string
  username: string
  password: string
}> {
  const accounts: Array<{
    name: string
    baseUrl: string
    username: string
    password: string
  }> = []

  // Support numbered accounts: CALDAV_1_*, CALDAV_2_*, etc.
  for (let i = 1; i <= 10; i++) {
    const prefix = `CALDAV_${i}_`
    const baseUrl = process.env[`${prefix}BASE_URL`]
    const username = process.env[`${prefix}USERNAME`]
    const password = process.env[`${prefix}PASSWORD`]
    const name = process.env[`${prefix}NAME`] || `Account ${i}`

    if (baseUrl && username && password) {
      accounts.push({ name, baseUrl, username, password })
    }
  }

  // Fallback to legacy single account format
  if (accounts.length === 0) {
    const baseUrl = process.env.CALDAV_BASE_URL
    const username = process.env.CALDAV_USERNAME
    const password = process.env.CALDAV_PASSWORD
    const name = process.env.CALDAV_NAME || "Default"

    if (baseUrl && username && password) {
      accounts.push({ name, baseUrl, username, password })
    }
  }

  return accounts
}

async function createClients(): Promise<CalDAVAccount[]> {
  const accountConfigs = parseAccounts()

  if (accountConfigs.length === 0) {
    throw new Error(
      "No CalDAV accounts configured. Set CALDAV_1_BASE_URL, CALDAV_1_USERNAME, CALDAV_1_PASSWORD, CALDAV_1_NAME environment variables.",
    )
  }

  const accounts: CalDAVAccount[] = []

  for (const config of accountConfigs) {
    console.log(
      `Connecting to CalDAV account: ${config.name} (${config.baseUrl})`,
    )
    const client = await CalDAVClient.create({
      baseUrl: config.baseUrl,
      auth: {
        type: "basic",
        username: config.username,
        password: config.password,
      },
    })

    // Fetch calendars to know which belong to this account
    const fetchedCalendars = await client.getCalendars()
    const calendars = fetchedCalendars.map((c) => ({
      name: c.displayName,
      url: c.url,
    }))

    accounts.push({
      name: config.name,
      client,
      baseUrl: config.baseUrl,
      calendars,
    })
    console.log(`Connected to ${config.name} (${calendars.length} calendars)`)
  }

  return accounts
}

async function createMcpServer(accounts: CalDAVAccount[]): Promise<McpServer> {
  const server = new McpServer({
    name: "caldav-mcp",
    version: "0.2.0",
  })

  registerCreateEvent(accounts, server)
  registerListEvents(accounts, server)
  registerDeleteEvent(accounts, server)
  await registerListCalendars(accounts, server)

  return server
}

async function runStdio(accounts: CalDAVAccount[]) {
  const server = await createMcpServer(accounts)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

async function runHTTP(accounts: CalDAVAccount[]) {
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`)

    // Health check endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({ status: "ok", accounts: accounts.map((a) => a.name) }),
      )
      return
    }

    // MCP endpoint - handles both GET and POST via StreamableHTTP
    if (url.pathname === "/mcp" || url.pathname === "/sse") {
      const server = await createMcpServer(accounts)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      })

      await server.connect(transport)
      await transport.handleRequest(req, res)
      return
    }

    res.writeHead(404).end("Not found")
  })

  httpServer.listen(PORT, HOST, () => {
    console.log(`CalDAV MCP server running on http://${HOST}:${PORT}`)
    console.log(`MCP endpoint: http://${HOST}:${PORT}/mcp`)
    console.log(`Accounts: ${accounts.map((a) => a.name).join(", ")}`)
  })
}

async function main() {
  const accounts = await createClients()
  const mode = process.argv[2] || "stdio"

  if (mode === "sse" || mode === "http") {
    await runHTTP(accounts)
  } else {
    await runStdio(accounts)
  }
}

main()
