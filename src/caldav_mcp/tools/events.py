"""Tools for managing calendar events."""

import asyncio
from datetime import datetime, timedelta
from typing import Any

from ..client import CalDAVAccount


def find_account_for_calendar(accounts: list[CalDAVAccount], calendar_url: str) -> CalDAVAccount | None:
    """Find the account that owns a calendar by its URL.

    Args:
        accounts: List of CalDAV accounts
        calendar_url: Calendar URL

    Returns:
        Account that owns the calendar, or None if not found
    """
    # Normalize the URL
    from ..client import CalDAVAccount as CalDAVAccountClass

    normalized_url = CalDAVAccountClass._normalize_url(calendar_url)

    for account in accounts:
        for calendar in account.calendars:
            if CalDAVAccountClass._normalize_url(calendar.url) == normalized_url:
                return account

    return None


async def list_events_tool(
    accounts: list[CalDAVAccount],
    calendar_url: str,
    start: str,
    end: str | None = None,
) -> list[dict[str, Any]]:
    """List events in a calendar within a date range.

    Args:
        accounts: List of CalDAV accounts
        calendar_url: Calendar URL from list-calendars
        start: Start date in ISO 8601 format (e.g., 2025-11-27 or 2025-11-27T00:00:00Z)
        end: End date in ISO 8601 format. If not provided, defaults to 30 days after start

    Returns:
        List of events with summary, start, end, and other details
    """
    account = find_account_for_calendar(accounts, calendar_url)
    if not account:
        raise ValueError(
            f"No account found for calendar URL: {calendar_url}. "
            f"Available URLs: {', '.join(c.url for a in accounts for c in a.calendars)}"
        )

    # Parse dates
    start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    if end:
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
    else:
        # Default to 30 days after start
        end_dt = start_dt + timedelta(days=30)

    # Fetch events (run in thread pool since it's synchronous)
    events = await asyncio.to_thread(account.list_events, calendar_url, start_dt, end_dt)

    # Convert to dict format
    result = []
    for event in events:
        result.append(
            {
                "uid": event.uid,
                "summary": event.summary,
                "start": event.start.isoformat(),
                "end": event.end.isoformat(),
                "description": event.description,
                "location": event.location,
            }
        )

    return result


async def create_event_tool(
    accounts: list[CalDAVAccount],
    calendar_url: str,
    summary: str,
    start: str,
    end: str,
    description: str | None = None,
    location: str | None = None,
) -> str:
    """Create a new calendar event.

    Args:
        accounts: List of CalDAV accounts
        calendar_url: Calendar URL from list-calendars
        summary: Event summary/title
        start: Start datetime in ISO 8601 format
        end: End datetime in ISO 8601 format
        description: Optional event description
        location: Optional event location

    Returns:
        UID of the created event
    """
    account = find_account_for_calendar(accounts, calendar_url)
    if not account:
        raise ValueError(f"No account found for calendar URL: {calendar_url}")

    # Parse datetimes
    start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))

    # Create event (run in thread pool since it's synchronous)
    uid = await asyncio.to_thread(
        account.create_event,
        calendar_url,
        summary,
        start_dt,
        end_dt,
        description,
        location,
    )

    return uid


async def delete_event_tool(
    accounts: list[CalDAVAccount],
    calendar_url: str,
    uid: str,
) -> str:
    """Delete an event by UID.

    Args:
        accounts: List of CalDAV accounts
        calendar_url: Calendar URL from list-calendars
        uid: Event UID

    Returns:
        Success message
    """
    account = find_account_for_calendar(accounts, calendar_url)
    if not account:
        raise ValueError(f"No account found for calendar URL: {calendar_url}")

    # Delete event (run in thread pool since it's synchronous)
    await asyncio.to_thread(account.delete_event, calendar_url, uid)

    return f"Event {uid} deleted successfully"
