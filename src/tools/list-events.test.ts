/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, vi, beforeEach } from "vitest"
import { registerListEvents } from "./list-events.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CalDAVAccount } from "../index.js"

describe("registerListEvents", () => {
  let mockServer: McpServer
  let mockAccounts: CalDAVAccount[]
  let registeredToolHandler: any

  beforeEach(() => {
    // Create a mock server that captures the tool handler
    mockServer = {
      tool: vi.fn((name, description, schema, handler) => {
        registeredToolHandler = handler
      }),
    } as any

    // Create mock accounts with calendars
    mockAccounts = [
      {
        name: "Test Account",
        client: {
          getEvents: vi.fn(),
        } as any,
        calendars: [
          {
            url: "https://caldav.example.com/calendars/test/calendar1",
            displayName: "Test Calendar",
          },
        ],
      },
    ]
  })

  describe("Tool Registration", () => {
    test("should register list-events tool with correct parameters", () => {
      registerListEvents(mockAccounts, mockServer)

      expect(mockServer.tool).toHaveBeenCalledWith(
        "list-events",
        expect.stringContaining("List all events"),
        expect.objectContaining({
          calendarUrl: expect.anything(),
          start: expect.anything(),
          end: expect.anything(),
        }),
        expect.any(Function),
      )
    })
  })

  describe("Date Handling", () => {
    test("should use 30 days as default end date when not provided", async () => {
      const mockGetEvents = vi.fn().mockResolvedValue([])
      mockAccounts[0].client.getEvents = mockGetEvents

      registerListEvents(mockAccounts, mockServer)

      await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: null,
      })

      expect(mockGetEvents).toHaveBeenCalledWith(
        "https://caldav.example.com/calendars/test/calendar1",
        expect.objectContaining({
          start: new Date("2025-01-01T00:00:00Z"),
          end: new Date("2025-01-31T00:00:00Z"), // 30 days later
        }),
      )
    })

    test("should use provided end date when specified", async () => {
      const mockGetEvents = vi.fn().mockResolvedValue([])
      mockAccounts[0].client.getEvents = mockGetEvents

      registerListEvents(mockAccounts, mockServer)

      await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-15T23:59:59Z",
      })

      expect(mockGetEvents).toHaveBeenCalledWith(
        "https://caldav.example.com/calendars/test/calendar1",
        expect.objectContaining({
          start: new Date("2025-01-01T00:00:00Z"),
          end: new Date("2025-01-15T23:59:59Z"),
        }),
      )
    })

    test("should handle ISO date strings without time", async () => {
      const mockGetEvents = vi.fn().mockResolvedValue([])
      mockAccounts[0].client.getEvents = mockGetEvents

      registerListEvents(mockAccounts, mockServer)

      await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01",
        end: "2025-01-31",
      })

      expect(mockGetEvents).toHaveBeenCalled()
      const callArgs = mockGetEvents.mock.calls[0][1]
      expect(callArgs.start).toBeInstanceOf(Date)
      expect(callArgs.end).toBeInstanceOf(Date)
    })
  })

  describe("Calendar URL Handling", () => {
    test("should find account by calendar URL", async () => {
      const mockGetEvents = vi.fn().mockResolvedValue([])
      mockAccounts[0].client.getEvents = mockGetEvents

      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
      })

      expect(mockGetEvents).toHaveBeenCalled()
      expect(result.isError).toBeUndefined()
    })

    test("should return error when calendar URL not found", async () => {
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/nonexistent",
        start: "2025-01-01T00:00:00Z",
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain(
        "No account found for calendar URL",
      )
    })

    test("should handle multiple accounts", async () => {
      const mockGetEvents1 = vi.fn().mockResolvedValue([])
      const mockGetEvents2 = vi.fn().mockResolvedValue([])

      const multipleAccounts: CalDAVAccount[] = [
        {
          name: "Account 1",
          client: { getEvents: mockGetEvents1 } as any,
          calendars: [
            { url: "https://cal1.example.com/calendar", displayName: "Cal 1" },
          ],
        },
        {
          name: "Account 2",
          client: { getEvents: mockGetEvents2 } as any,
          calendars: [
            { url: "https://cal2.example.com/calendar", displayName: "Cal 2" },
          ],
        },
      ]

      registerListEvents(multipleAccounts, mockServer)

      // Should use Account 2
      await registeredToolHandler({
        calendarUrl: "https://cal2.example.com/calendar",
        start: "2025-01-01T00:00:00Z",
      })

      expect(mockGetEvents1).not.toHaveBeenCalled()
      expect(mockGetEvents2).toHaveBeenCalled()
    })
  })

  describe("Non-recurring Events", () => {
    test("should return non-recurring events with isRecurring: false", async () => {
      const mockEvents = [
        {
          uid: "event-1",
          summary: "Team Meeting",
          start: new Date("2025-01-15T10:00:00Z"),
          end: new Date("2025-01-15T11:00:00Z"),
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-31T23:59:59Z",
      })

      expect(result.isError).toBeUndefined()

      const responseData = JSON.parse(result.content[0].text)
      expect(responseData).toHaveLength(1)
      expect(responseData[0]).toMatchObject({
        summary: "Team Meeting",
        start: "2025-01-15T10:00:00.000Z",
        end: "2025-01-15T11:00:00.000Z",
        isRecurring: false,
      })
      expect(responseData[0].originalStart).toBeUndefined()
      expect(responseData[0].originalEventUid).toBeUndefined()
    })
  })

  describe("Recurring Events Expansion", () => {
    test("should expand recurring events and include metadata", async () => {
      const mockEvents = [
        {
          uid: "recurring-1",
          summary: "Daily Standup",
          start: new Date("2025-01-01T09:00:00Z"),
          end: new Date("2025-01-01T09:30:00Z"),
          recurrenceRule: {
            freq: "DAILY",
            interval: 1,
            count: 3,
          },
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-05T23:59:59Z",
      })

      const responseData = JSON.parse(result.content[0].text)

      // Should have 3 occurrences from the recurring event
      expect(responseData).toHaveLength(3)

      // Check first occurrence
      expect(responseData[0]).toMatchObject({
        summary: "Daily Standup",
        start: "2025-01-01T09:00:00.000Z",
        isRecurring: true,
        originalStart: "2025-01-01T09:00:00.000Z",
        originalEventUid: "recurring-1",
      })

      // Check second occurrence
      expect(responseData[1]).toMatchObject({
        summary: "Daily Standup",
        start: "2025-01-02T09:00:00.000Z",
        isRecurring: true,
        originalStart: "2025-01-01T09:00:00.000Z",
        originalEventUid: "recurring-1",
      })
    })

    test("should include originalStart and originalEventUid only for recurring events", async () => {
      const mockEvents = [
        {
          uid: "single",
          summary: "One-time Event",
          start: new Date("2025-01-10T10:00:00Z"),
          end: new Date("2025-01-10T11:00:00Z"),
        },
        {
          uid: "recurring",
          summary: "Weekly Meeting",
          start: new Date("2025-01-01T14:00:00Z"),
          end: new Date("2025-01-01T15:00:00Z"),
          recurrenceRule: {
            freq: "WEEKLY",
            interval: 1,
            count: 2,
          },
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-31T23:59:59Z",
      })

      const responseData = JSON.parse(result.content[0].text)

      // 1 single + 2 recurring occurrences = 3 total
      expect(responseData).toHaveLength(3)

      // Find the non-recurring event
      const singleEvent = responseData.find(
        (e: any) => e.summary === "One-time Event",
      )
      expect(singleEvent.isRecurring).toBe(false)
      expect(singleEvent.originalStart).toBeUndefined()
      expect(singleEvent.originalEventUid).toBeUndefined()

      // Find recurring events
      const recurringEvents = responseData.filter(
        (e: any) => e.summary === "Weekly Meeting",
      )
      expect(recurringEvents).toHaveLength(2)
      recurringEvents.forEach((event: any) => {
        expect(event.isRecurring).toBe(true)
        expect(event.originalStart).toBeDefined()
        expect(event.originalEventUid).toBe("recurring")
      })
    })
  })

  describe("Event Sorting", () => {
    test("should return events sorted by start date", async () => {
      const mockEvents = [
        {
          uid: "event-3",
          summary: "Third",
          start: new Date("2025-01-20T10:00:00Z"),
          end: new Date("2025-01-20T11:00:00Z"),
        },
        {
          uid: "event-1",
          summary: "First",
          start: new Date("2025-01-10T10:00:00Z"),
          end: new Date("2025-01-10T11:00:00Z"),
        },
        {
          uid: "event-2",
          summary: "Second",
          start: new Date("2025-01-15T10:00:00Z"),
          end: new Date("2025-01-15T11:00:00Z"),
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-31T23:59:59Z",
      })

      const responseData = JSON.parse(result.content[0].text)

      expect(responseData[0].summary).toBe("First")
      expect(responseData[1].summary).toBe("Second")
      expect(responseData[2].summary).toBe("Third")
    })

    test("should sort mixed recurring and non-recurring events chronologically", async () => {
      const mockEvents = [
        {
          uid: "recurring",
          summary: "Daily at 9am",
          start: new Date("2025-01-01T09:00:00Z"),
          end: new Date("2025-01-01T10:00:00Z"),
          recurrenceRule: {
            freq: "DAILY",
            interval: 1,
            count: 3,
          },
        },
        {
          uid: "single",
          summary: "One-off at 2pm on Jan 2",
          start: new Date("2025-01-02T14:00:00Z"),
          end: new Date("2025-01-02T15:00:00Z"),
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-05T23:59:59Z",
      })

      const responseData = JSON.parse(result.content[0].text)

      // Should be: Jan 1 9am, Jan 2 9am, Jan 2 2pm, Jan 3 9am
      expect(responseData).toHaveLength(4)
      expect(new Date(responseData[0].start)).toEqual(
        new Date("2025-01-01T09:00:00Z"),
      )
      expect(new Date(responseData[1].start)).toEqual(
        new Date("2025-01-02T09:00:00Z"),
      )
      expect(new Date(responseData[2].start)).toEqual(
        new Date("2025-01-02T14:00:00Z"),
      )
      expect(new Date(responseData[3].start)).toEqual(
        new Date("2025-01-03T09:00:00Z"),
      )
    })
  })

  describe("Error Handling", () => {
    test("should handle CalDAV client errors gracefully", async () => {
      mockAccounts[0].client.getEvents = vi
        .fn()
        .mockRejectedValue(new Error("CalDAV connection failed"))

      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("Error fetching events")
      expect(result.content[0].text).toContain("CalDAV connection failed")
    })

    test("should handle non-Error exceptions", async () => {
      mockAccounts[0].client.getEvents = vi
        .fn()
        .mockRejectedValue("String error")

      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("String error")
    })
  })

  describe("Empty Results", () => {
    test("should handle empty event list", async () => {
      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue([])

      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-31T23:59:59Z",
      })

      expect(result.isError).toBeUndefined()

      const responseData = JSON.parse(result.content[0].text)
      expect(responseData).toEqual([])
    })

    test("should handle recurring events with no occurrences in range", async () => {
      const mockEvents = [
        {
          uid: "recurring",
          summary: "Future Event",
          start: new Date("2026-01-01T10:00:00Z"),
          end: new Date("2026-01-01T11:00:00Z"),
          recurrenceRule: {
            freq: "DAILY",
            interval: 1,
          },
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-31T23:59:59Z",
      })

      const responseData = JSON.parse(result.content[0].text)
      expect(responseData).toEqual([])
    })
  })

  describe("Response Format", () => {
    test("should return JSON formatted response", async () => {
      const mockEvents = [
        {
          uid: "event-1",
          summary: "Test Event",
          start: new Date("2025-01-15T10:00:00Z"),
          end: new Date("2025-01-15T11:00:00Z"),
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-31T23:59:59Z",
      })

      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")

      // Should be valid JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow()
    })

    test("should format dates as ISO strings in response", async () => {
      const mockEvents = [
        {
          uid: "event-1",
          summary: "Test Event",
          start: new Date("2025-01-15T10:00:00Z"),
          end: new Date("2025-01-15T11:00:00Z"),
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-31T23:59:59Z",
      })

      const responseData = JSON.parse(result.content[0].text)

      expect(typeof responseData[0].start).toBe("string")
      expect(typeof responseData[0].end).toBe("string")
      expect(responseData[0].start).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      )
    })

    test("should only include summary, start, end, isRecurring and conditional fields", async () => {
      const mockEvents = [
        {
          uid: "event-1",
          summary: "Test Event",
          start: new Date("2025-01-15T10:00:00Z"),
          end: new Date("2025-01-15T11:00:00Z"),
          description: "This should not be in response",
          location: "This should not be in response",
          extraField: "This should not be in response",
        },
      ]

      mockAccounts[0].client.getEvents = vi.fn().mockResolvedValue(mockEvents)
      registerListEvents(mockAccounts, mockServer)

      const result = await registeredToolHandler({
        calendarUrl: "https://caldav.example.com/calendars/test/calendar1",
        start: "2025-01-01T00:00:00Z",
        end: "2025-01-31T23:59:59Z",
      })

      const responseData = JSON.parse(result.content[0].text)

      expect(Object.keys(responseData[0])).toEqual([
        "summary",
        "start",
        "end",
        "isRecurring",
      ])
      expect(responseData[0].description).toBeUndefined()
      expect(responseData[0].location).toBeUndefined()
      expect(responseData[0].uid).toBeUndefined()
    })
  })
})
