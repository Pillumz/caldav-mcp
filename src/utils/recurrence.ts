import rruleLib from "rrule"
import type { Event, RecurrenceRule } from "ts-caldav"

const { RRule } = rruleLib

export interface ExpandedEvent {
  uid: string
  summary: string
  start: Date
  end: Date
  description?: string
  location?: string
  isRecurring: boolean
  originalStart?: Date
  originalEventUid?: string
  recurrenceRule?: RecurrenceRule
}

const WEEKDAY_MAP: Record<string, InstanceType<typeof rruleLib.Weekday>> = {
  SU: RRule.SU,
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
}

const FREQ_MAP: Record<string, number> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
}

function parseByDay(byday: string[]): InstanceType<typeof rruleLib.Weekday>[] {
  return byday.map((day) => {
    // Handle nth weekday patterns like "1MO" (first Monday), "-1FR" (last Friday)
    const match = day.match(/^(-?\d+)?([A-Z]{2})$/)
    if (!match) return WEEKDAY_MAP[day] || RRule.MO

    const [, nth, weekday] = match
    const rruleWeekday = WEEKDAY_MAP[weekday]

    if (nth && rruleWeekday) {
      return rruleWeekday.nth(parseInt(nth, 10))
    }
    return rruleWeekday || RRule.MO
  })
}

export function expandRecurringEvents(
  events: Event[],
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedEvent[] {
  const expandedEvents: ExpandedEvent[] = []

  for (const event of events) {
    if (!event.recurrenceRule || !event.recurrenceRule.freq) {
      // Non-recurring event: include as-is
      expandedEvents.push({
        uid: event.uid,
        summary: event.summary,
        start: event.start,
        end: event.end,
        description: event.description,
        location: event.location,
        isRecurring: false,
      })
      continue
    }

    const duration = event.end.getTime() - event.start.getTime()
    const rule = event.recurrenceRule

    const rruleOptions: ConstructorParameters<typeof RRule>[0] = {
      freq: FREQ_MAP[rule.freq!],
      dtstart: event.start,
      interval: rule.interval || 1,
    }

    if (rule.count) {
      rruleOptions.count = rule.count
    }
    if (rule.until) {
      rruleOptions.until = rule.until
    }
    if (rule.byday && rule.byday.length > 0) {
      rruleOptions.byweekday = parseByDay(rule.byday)
    }
    if (rule.bymonthday && rule.bymonthday.length > 0) {
      rruleOptions.bymonthday = rule.bymonthday
    }
    if (rule.bymonth && rule.bymonth.length > 0) {
      rruleOptions.bymonth = rule.bymonth
    }

    try {
      const rrule = new RRule(rruleOptions)
      const occurrences = rrule.between(rangeStart, rangeEnd, true)

      for (const occurrenceStart of occurrences) {
        const occurrenceEnd = new Date(occurrenceStart.getTime() + duration)
        expandedEvents.push({
          uid: event.uid,
          summary: event.summary,
          start: occurrenceStart,
          end: occurrenceEnd,
          description: event.description,
          location: event.location,
          isRecurring: true,
          originalStart: event.start,
          originalEventUid: event.uid,
          recurrenceRule: event.recurrenceRule,
        })
      }
    } catch (error) {
      console.error(`[recurrence] Failed to expand event ${event.uid}:`, error)
      // Fallback: include original event if expansion fails
      expandedEvents.push({
        uid: event.uid,
        summary: event.summary,
        start: event.start,
        end: event.end,
        description: event.description,
        location: event.location,
        isRecurring: true,
        recurrenceRule: event.recurrenceRule,
      })
    }
  }

  return expandedEvents.sort((a, b) => a.start.getTime() - b.start.getTime())
}
