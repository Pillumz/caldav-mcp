/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect } from "vitest"
import { expandRecurringEvents } from "./recurrence.js"
import type { Event } from "ts-caldav"

describe("expandRecurringEvents", () => {
  // Helper to create a base event
  const createEvent = (overrides: Partial<Event> = {}): Event => ({
    uid: "test-event-uid",
    summary: "Test Event",
    start: new Date("2025-01-01T10:00:00Z"),
    end: new Date("2025-01-01T11:00:00Z"),
    ...overrides,
  })

  describe("Non-recurring events", () => {
    test("should pass through non-recurring events unchanged with isRecurring: false", () => {
      const event = createEvent({
        uid: "non-recurring-1",
        summary: "Single Event",
        start: new Date("2025-01-15T14:00:00Z"),
        end: new Date("2025-01-15T15:00:00Z"),
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        uid: "non-recurring-1",
        summary: "Single Event",
        start: new Date("2025-01-15T14:00:00Z"),
        end: new Date("2025-01-15T15:00:00Z"),
        isRecurring: false,
      })
      expect(result[0].originalStart).toBeUndefined()
      expect(result[0].originalEventUid).toBeUndefined()
    })

    test("should pass through events without recurrenceRule", () => {
      const event = createEvent({
        recurrenceRule: undefined,
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01"),
        new Date("2025-01-31"),
      )

      expect(result).toHaveLength(1)
      expect(result[0].isRecurring).toBe(false)
    })

    test("should pass through events with empty recurrenceRule (no freq)", () => {
      const event = createEvent({
        recurrenceRule: {},
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01"),
        new Date("2025-01-31"),
      )

      expect(result).toHaveLength(1)
      expect(result[0].isRecurring).toBe(false)
    })
  })

  describe("DAILY recurring events", () => {
    test("should expand daily recurring events correctly", () => {
      const event = createEvent({
        uid: "daily-event",
        summary: "Daily Standup",
        start: new Date("2025-01-01T09:00:00Z"),
        end: new Date("2025-01-01T09:30:00Z"),
        recurrenceRule: {
          freq: "DAILY",
          interval: 1,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-05T23:59:59Z"),
      )

      expect(result).toHaveLength(5) // 5 days
      expect(result[0].summary).toBe("Daily Standup")
      expect(result[0].isRecurring).toBe(true)
      expect(result[0].originalStart).toEqual(new Date("2025-01-01T09:00:00Z"))
      expect(result[0].originalEventUid).toBe("daily-event")

      // Check dates are sequential
      expect(result[0].start).toEqual(new Date("2025-01-01T09:00:00Z"))
      expect(result[1].start).toEqual(new Date("2025-01-02T09:00:00Z"))
      expect(result[4].start).toEqual(new Date("2025-01-05T09:00:00Z"))

      // Check duration is preserved (30 minutes)
      result.forEach((occurrence) => {
        const duration = occurrence.end.getTime() - occurrence.start.getTime()
        expect(duration).toBe(30 * 60 * 1000)
      })
    })

    test("should handle daily events with interval > 1", () => {
      const event = createEvent({
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        recurrenceRule: {
          freq: "DAILY",
          interval: 2, // Every 2 days
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-10T23:59:59Z"),
      )

      // Days 1, 3, 5, 7, 9 = 5 occurrences
      expect(result).toHaveLength(5)
      expect(result[0].start).toEqual(new Date("2025-01-01T10:00:00Z"))
      expect(result[1].start).toEqual(new Date("2025-01-03T10:00:00Z"))
      expect(result[2].start).toEqual(new Date("2025-01-05T10:00:00Z"))
    })
  })

  describe("WEEKLY recurring events", () => {
    test("should expand weekly recurring events correctly", () => {
      const event = createEvent({
        uid: "weekly-meeting",
        summary: "Team Meeting",
        start: new Date("2025-01-06T14:00:00Z"), // Monday
        end: new Date("2025-01-06T15:00:00Z"),
        recurrenceRule: {
          freq: "WEEKLY",
          interval: 1,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      // Should have 4-5 Mondays in January
      expect(result.length).toBeGreaterThanOrEqual(4)
      result.forEach((occurrence) => {
        expect(occurrence.start.getUTCDay()).toBe(1) // Monday
        expect(occurrence.isRecurring).toBe(true)
      })
    })

    test("should handle WEEKLY with BYDAY (MO,WE,FR)", () => {
      const event = createEvent({
        summary: "Gym Days",
        start: new Date("2025-01-06T06:00:00Z"), // Monday Jan 6
        end: new Date("2025-01-06T07:00:00Z"),
        recurrenceRule: {
          freq: "WEEKLY",
          interval: 1,
          byday: ["MO", "WE", "FR"],
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-06T00:00:00Z"), // Start from event date
        new Date("2025-01-19T23:59:59Z"), // 2 full weeks
      )

      // Should have Mon/Wed/Fri for 2 weeks = 6 occurrences
      expect(result.length).toBeGreaterThanOrEqual(6)

      // Check they're on correct days (Monday=1, Wednesday=3, Friday=5)
      const days = result.map((e) => e.start.getUTCDay())
      days.forEach((day) => {
        expect([1, 3, 5]).toContain(day)
      })
    })

    test("should handle WEEKLY with single BYDAY", () => {
      const event = createEvent({
        summary: "Friday Update",
        start: new Date("2025-01-03T16:00:00Z"), // Friday
        end: new Date("2025-01-03T17:00:00Z"),
        recurrenceRule: {
          freq: "WEEKLY",
          interval: 1,
          byday: ["FR"],
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      // Should have 4-5 Fridays
      expect(result.length).toBeGreaterThanOrEqual(4)
      result.forEach((occurrence) => {
        expect(occurrence.start.getUTCDay()).toBe(5) // Friday
      })
    })
  })

  describe("MONTHLY recurring events", () => {
    test("should expand monthly recurring events with BYMONTHDAY", () => {
      const event = createEvent({
        summary: "Monthly Report",
        start: new Date("2025-01-15T10:00:00Z"),
        end: new Date("2025-01-15T11:00:00Z"),
        recurrenceRule: {
          freq: "MONTHLY",
          interval: 1,
          bymonthday: [15],
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-06-30T23:59:59Z"),
      )

      // 6 months = 6 occurrences
      expect(result).toHaveLength(6)
      result.forEach((occurrence) => {
        expect(occurrence.start.getUTCDate()).toBe(15) // 15th of month
        expect(occurrence.isRecurring).toBe(true)
      })
    })

    test("should handle monthly events on last day of month", () => {
      const event = createEvent({
        summary: "End of Month Review",
        start: new Date("2025-01-31T23:00:00Z"),
        end: new Date("2025-01-31T23:59:00Z"),
        recurrenceRule: {
          freq: "MONTHLY",
          interval: 1,
          bymonthday: [31],
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-12-31T23:59:59Z"),
      )

      // Only months with 31 days: Jan, Mar, May, Jul, Aug, Oct, Dec = 7
      expect(result).toHaveLength(7)
    })

    test("should handle nth weekday patterns like first Monday", () => {
      const event = createEvent({
        summary: "First Monday Meeting",
        start: new Date("2025-01-06T10:00:00Z"), // First Monday of Jan 2025
        end: new Date("2025-01-06T11:00:00Z"),
        recurrenceRule: {
          freq: "MONTHLY",
          interval: 1,
          byday: ["1MO"], // First Monday
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-04-30T23:59:59Z"),
      )

      // 4 months = 4 first Mondays
      expect(result).toHaveLength(4)
      result.forEach((occurrence) => {
        expect(occurrence.start.getUTCDay()).toBe(1) // Monday
        // Should be in first week (day 1-7)
        expect(occurrence.start.getUTCDate()).toBeLessThanOrEqual(7)
      })
    })

    test("should handle last Friday pattern", () => {
      const event = createEvent({
        summary: "Last Friday Celebration",
        start: new Date("2025-01-31T17:00:00Z"), // Last Friday of Jan
        end: new Date("2025-01-31T18:00:00Z"),
        recurrenceRule: {
          freq: "MONTHLY",
          interval: 1,
          byday: ["-1FR"], // Last Friday
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-03-31T23:59:59Z"),
      )

      expect(result.length).toBeGreaterThanOrEqual(3)
      result.forEach((occurrence) => {
        expect(occurrence.start.getUTCDay()).toBe(5) // Friday
        // Should be in last week of month (day > 21)
        expect(occurrence.start.getUTCDate()).toBeGreaterThan(21)
      })
    })
  })

  describe("YEARLY recurring events", () => {
    test("should expand yearly recurring events (birthdays/anniversaries)", () => {
      const event = createEvent({
        summary: "John's Birthday",
        start: new Date("2025-03-15T00:00:00Z"),
        end: new Date("2025-03-15T23:59:00Z"),
        recurrenceRule: {
          freq: "YEARLY",
          interval: 1,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2027-12-31T23:59:59Z"),
      )

      // 3 years = 3 birthdays
      expect(result).toHaveLength(3)
      result.forEach((occurrence, index) => {
        expect(occurrence.start.getUTCMonth()).toBe(2) // March (0-indexed)
        expect(occurrence.start.getUTCDate()).toBe(15)
        expect(occurrence.start.getUTCFullYear()).toBe(2025 + index)
      })
    })

    test("should handle yearly events with specific month and day", () => {
      const event = createEvent({
        summary: "New Year's Day",
        start: new Date("2025-01-01T00:00:00Z"),
        end: new Date("2025-01-01T23:59:00Z"),
        recurrenceRule: {
          freq: "YEARLY",
          interval: 1,
          bymonth: [1],
          bymonthday: [1],
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2029-12-31T23:59:59Z"),
      )

      expect(result).toHaveLength(5)
      result.forEach((occurrence) => {
        expect(occurrence.start.getUTCMonth()).toBe(0) // January
        expect(occurrence.start.getUTCDate()).toBe(1)
      })
    })
  })

  describe("Recurrence limits", () => {
    test("should respect count limit", () => {
      const event = createEvent({
        summary: "Limited Event",
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        recurrenceRule: {
          freq: "DAILY",
          interval: 1,
          count: 5, // Only 5 occurrences
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"), // Range is larger than count
      )

      expect(result).toHaveLength(5)
      expect(result[4].start).toEqual(new Date("2025-01-05T10:00:00Z"))
    })

    test("should respect until date", () => {
      const event = createEvent({
        summary: "Event with Until",
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        recurrenceRule: {
          freq: "DAILY",
          interval: 1,
          until: new Date("2025-01-10T00:00:00Z"), // Stops after Jan 10
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"), // Range is larger than until
      )

      // Should have occurrences from Jan 1-10
      expect(result.length).toBeLessThanOrEqual(10)
      result.forEach((occurrence) => {
        expect(occurrence.start.getTime()).toBeLessThanOrEqual(
          new Date("2025-01-10T23:59:59Z").getTime(),
        )
      })
    })

    test("should stop at count even within date range", () => {
      const event = createEvent({
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        recurrenceRule: {
          freq: "DAILY",
          interval: 1,
          count: 3,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-10T23:59:59Z"),
      )

      expect(result).toHaveLength(3)
    })
  })

  describe("Query range filtering", () => {
    test("should exclude events outside query range", () => {
      const event = createEvent({
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        recurrenceRule: {
          freq: "DAILY",
          interval: 1,
        },
      })

      // Query only for January 15-20
      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-15T00:00:00Z"),
        new Date("2025-01-20T23:59:59Z"),
      )

      // Should only have 6 days
      expect(result).toHaveLength(6)
      expect(result[0].start).toEqual(new Date("2025-01-15T10:00:00Z"))
      expect(result[5].start).toEqual(new Date("2025-01-20T10:00:00Z"))
    })

    test("should include events at range boundaries", () => {
      const event = createEvent({
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        recurrenceRule: {
          freq: "DAILY",
          interval: 1,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T10:00:00Z"), // Exactly at start
        new Date("2025-01-03T10:00:00Z"), // Exactly at third occurrence
      )

      expect(result).toHaveLength(3)
    })
  })

  describe("Error handling and edge cases", () => {
    test("should handle invalid recurrence rule gracefully", () => {
      const event = createEvent({
        summary: "Event with bad rule",
        recurrenceRule: {
          freq: "INVALID_FREQ" as any,
          interval: 1,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      // Should fall back to including the original event
      expect(result).toHaveLength(1)
      expect(result[0].isRecurring).toBe(true)
      expect(result[0].summary).toBe("Event with bad rule")
    })

    test("should preserve event description and location", () => {
      const event = createEvent({
        summary: "Team Meeting",
        description: "Weekly sync",
        location: "Conference Room A",
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T11:00:00Z"),
        recurrenceRule: {
          freq: "WEEKLY",
          interval: 1,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-15T23:59:59Z"),
      )

      expect(result.length).toBeGreaterThan(0)
      result.forEach((occurrence) => {
        expect(occurrence.description).toBe("Weekly sync")
        expect(occurrence.location).toBe("Conference Room A")
      })
    })

    test("should preserve recurrenceRule in expanded events", () => {
      const event = createEvent({
        recurrenceRule: {
          freq: "DAILY",
          interval: 2,
          count: 5,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      result.forEach((occurrence) => {
        expect(occurrence.recurrenceRule).toBeDefined()
        expect(occurrence.recurrenceRule?.freq).toBe("DAILY")
        expect(occurrence.recurrenceRule?.interval).toBe(2)
        expect(occurrence.recurrenceRule?.count).toBe(5)
      })
    })
  })

  describe("Sorting and ordering", () => {
    test("should sort results by start date", () => {
      const events = [
        createEvent({
          uid: "event-2",
          summary: "Second Event",
          start: new Date("2025-01-15T10:00:00Z"),
          end: new Date("2025-01-15T11:00:00Z"),
        }),
        createEvent({
          uid: "event-1",
          summary: "First Event",
          start: new Date("2025-01-10T10:00:00Z"),
          end: new Date("2025-01-10T11:00:00Z"),
        }),
        createEvent({
          uid: "event-3",
          summary: "Third Event",
          start: new Date("2025-01-20T10:00:00Z"),
          end: new Date("2025-01-20T11:00:00Z"),
        }),
      ]

      const result = expandRecurringEvents(
        events,
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      expect(result).toHaveLength(3)
      expect(result[0].summary).toBe("First Event")
      expect(result[1].summary).toBe("Second Event")
      expect(result[2].summary).toBe("Third Event")
    })

    test("should sort mixed recurring and non-recurring events by date", () => {
      const events = [
        createEvent({
          uid: "recurring",
          summary: "Daily Meeting",
          start: new Date("2025-01-01T09:00:00Z"),
          end: new Date("2025-01-01T10:00:00Z"),
          recurrenceRule: {
            freq: "DAILY",
            interval: 1,
          },
        }),
        createEvent({
          uid: "single",
          summary: "One-off Event",
          start: new Date("2025-01-02T14:00:00Z"),
          end: new Date("2025-01-02T15:00:00Z"),
        }),
      ]

      const result = expandRecurringEvents(
        events,
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-05T23:59:59Z"),
      )

      // Should have 5 daily + 1 single = 6 total
      expect(result).toHaveLength(6)

      // Verify chronological order
      for (let i = 1; i < result.length; i++) {
        expect(result[i].start.getTime()).toBeGreaterThanOrEqual(
          result[i - 1].start.getTime(),
        )
      }
    })
  })

  describe("Duration preservation", () => {
    test("should preserve event duration across all occurrences", () => {
      const event = createEvent({
        start: new Date("2025-01-01T10:00:00Z"),
        end: new Date("2025-01-01T12:30:00Z"), // 2.5 hours
        recurrenceRule: {
          freq: "DAILY",
          interval: 1,
          count: 5,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      const expectedDuration = 2.5 * 60 * 60 * 1000 // 2.5 hours in ms

      result.forEach((occurrence) => {
        const duration = occurrence.end.getTime() - occurrence.start.getTime()
        expect(duration).toBe(expectedDuration)
      })
    })

    test("should handle all-day events", () => {
      const event = createEvent({
        start: new Date("2025-01-01T00:00:00Z"),
        end: new Date("2025-01-02T00:00:00Z"), // 24 hours
        recurrenceRule: {
          freq: "WEEKLY",
          interval: 1,
          count: 4,
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-02-28T23:59:59Z"),
      )

      const oneDayInMs = 24 * 60 * 60 * 1000

      result.forEach((occurrence) => {
        const duration = occurrence.end.getTime() - occurrence.start.getTime()
        expect(duration).toBe(oneDayInMs)
      })
    })
  })

  describe("Complex combinations", () => {
    test("should handle WEEKLY with BYDAY and interval", () => {
      const event = createEvent({
        summary: "Bi-weekly Tue/Thu",
        start: new Date("2025-01-07T10:00:00Z"), // Tuesday
        end: new Date("2025-01-07T11:00:00Z"),
        recurrenceRule: {
          freq: "WEEKLY",
          interval: 2, // Every 2 weeks
          byday: ["TU", "TH"],
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      // Verify all are Tuesday or Thursday
      result.forEach((occurrence) => {
        const day = occurrence.start.getUTCDay()
        expect([2, 4]).toContain(day) // Tuesday=2, Thursday=4
      })
    })

    test("should handle empty arrays in recurrence rule", () => {
      const event = createEvent({
        recurrenceRule: {
          freq: "MONTHLY",
          interval: 1,
          byday: [], // Empty array
          bymonthday: [], // Empty array
        },
      })

      const result = expandRecurringEvents(
        [event],
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-03-31T23:59:59Z"),
      )

      // Should still work with monthly frequency
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].isRecurring).toBe(true)
    })
  })

  describe("Multiple events", () => {
    test("should handle multiple events with different recurrence patterns", () => {
      const events = [
        createEvent({
          uid: "daily",
          summary: "Daily Standup",
          start: new Date("2025-01-01T09:00:00Z"),
          end: new Date("2025-01-01T09:30:00Z"),
          recurrenceRule: {
            freq: "DAILY",
            interval: 1,
            count: 5,
          },
        }),
        createEvent({
          uid: "weekly",
          summary: "Weekly Review",
          start: new Date("2025-01-06T14:00:00Z"),
          end: new Date("2025-01-06T15:00:00Z"),
          recurrenceRule: {
            freq: "WEEKLY",
            interval: 1,
            count: 2,
          },
        }),
        createEvent({
          uid: "single",
          summary: "One-time Event",
          start: new Date("2025-01-15T10:00:00Z"),
          end: new Date("2025-01-15T11:00:00Z"),
        }),
      ]

      const result = expandRecurringEvents(
        events,
        new Date("2025-01-01T00:00:00Z"),
        new Date("2025-01-31T23:59:59Z"),
      )

      // 5 daily + 2 weekly + 1 single = 8 total
      expect(result).toHaveLength(8)

      // Verify all UIDs are preserved
      const uids = result.map((e) => e.uid)
      expect(uids.filter((uid) => uid === "daily")).toHaveLength(5)
      expect(uids.filter((uid) => uid === "weekly")).toHaveLength(2)
      expect(uids.filter((uid) => uid === "single")).toHaveLength(1)
    })
  })
})
