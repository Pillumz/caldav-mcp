"""CalDAV client wrapper for managing calendar operations."""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import caldav
from caldav.elements import dav
from icalendar import Calendar, Event as ICalEvent

from .config import CalDAVAccountConfig

logger = logging.getLogger(__name__)


@dataclass
class CalendarInfo:
    """Information about a calendar."""

    name: str
    url: str
    account_name: str


@dataclass
class EventInfo:
    """Information about a calendar event."""

    uid: str
    summary: str
    start: datetime
    end: datetime
    calendar_url: str
    description: str | None = None
    location: str | None = None


class CalDAVAccount:
    """Wrapper for a CalDAV account with its client and calendars."""

    def __init__(self, config: CalDAVAccountConfig):
        """Initialize a CalDAV account.

        Args:
            config: Account configuration
        """
        self.name = config.name
        self.base_url = config.base_url
        self.username = config.username
        self.password = config.password
        self.client: caldav.DAVClient | None = None
        self.principal: caldav.Principal | None = None
        self.calendars: list[CalendarInfo] = []

    def connect(self) -> None:
        """Connect to the CalDAV server and fetch calendars."""
        try:
            logger.info(f"Connecting to CalDAV account: {self.name} ({self.base_url})")

            # Create caldav client
            self.client = caldav.DAVClient(
                url=self.base_url,
                username=self.username,
                password=self.password,
            )

            # Get principal and calendars
            self.principal = self.client.principal()
            cal_objects = self.principal.calendars()

            # Store calendar info
            self.calendars = [
                CalendarInfo(
                    name=cal.name or "Unnamed Calendar",
                    url=str(cal.url),
                    account_name=self.name,
                )
                for cal in cal_objects
            ]

            logger.info(f"Connected to {self.name}: found {len(self.calendars)} calendars")

        except Exception as e:
            logger.error(f"Failed to connect to {self.name}: {e}")
            raise

    def get_calendar_by_url(self, url: str) -> caldav.Calendar | None:
        """Get a calendar object by its URL.

        Args:
            url: Calendar URL

        Returns:
            Calendar object or None if not found
        """
        if not self.client or not self.principal:
            return None

        try:
            # Normalize URL
            normalized_url = self._normalize_url(url)

            # Find matching calendar
            for cal_info in self.calendars:
                if self._normalize_url(cal_info.url) == normalized_url:
                    return self.client.calendar(url=cal_info.url)

            return None

        except Exception as e:
            logger.error(f"Error getting calendar by URL {url}: {e}")
            return None

    @staticmethod
    def _normalize_url(url: str) -> str:
        """Normalize a calendar URL by removing the domain if present.

        Args:
            url: Full or partial calendar URL

        Returns:
            Normalized path-only URL
        """
        if url.startswith("http://") or url.startswith("https://"):
            from urllib.parse import urlparse

            parsed = urlparse(url)
            return parsed.path

        return url

    def list_events(
        self, calendar_url: str, start: datetime, end: datetime
    ) -> list[EventInfo]:
        """List events in a calendar within a date range.

        Args:
            calendar_url: Calendar URL
            start: Start datetime
            end: End datetime

        Returns:
            List of event information
        """
        calendar = self.get_calendar_by_url(calendar_url)
        if not calendar:
            raise ValueError(f"Calendar not found: {calendar_url}")

        try:
            # Fetch events
            events = calendar.date_search(start=start, end=end, expand=True)

            result = []
            for event in events:
                try:
                    # Parse iCalendar data
                    ical = Calendar.from_ical(event.data)

                    for component in ical.walk():
                        if component.name == "VEVENT":
                            uid = str(component.get("uid", ""))
                            summary = str(component.get("summary", ""))
                            event_start = component.get("dtstart").dt
                            event_end = component.get("dtend").dt
                            description = component.get("description")
                            location = component.get("location")

                            # Convert date to datetime if needed
                            if isinstance(event_start, datetime):
                                start_dt = event_start
                            else:
                                start_dt = datetime.combine(event_start, datetime.min.time())

                            if isinstance(event_end, datetime):
                                end_dt = event_end
                            else:
                                end_dt = datetime.combine(event_end, datetime.min.time())

                            result.append(
                                EventInfo(
                                    uid=uid,
                                    summary=summary,
                                    start=start_dt,
                                    end=end_dt,
                                    calendar_url=calendar_url,
                                    description=str(description) if description else None,
                                    location=str(location) if location else None,
                                )
                            )

                except Exception as e:
                    logger.warning(f"Failed to parse event: {e}")
                    continue

            return result

        except Exception as e:
            logger.error(f"Failed to list events: {e}")
            raise

    def create_event(
        self,
        calendar_url: str,
        summary: str,
        start: datetime,
        end: datetime,
        description: str | None = None,
        location: str | None = None,
    ) -> str:
        """Create a new calendar event.

        Args:
            calendar_url: Calendar URL
            summary: Event summary/title
            start: Start datetime
            end: End datetime
            description: Optional event description
            location: Optional event location

        Returns:
            UID of created event
        """
        calendar = self.get_calendar_by_url(calendar_url)
        if not calendar:
            raise ValueError(f"Calendar not found: {calendar_url}")

        try:
            # Create iCalendar event
            cal = Calendar()
            event = ICalEvent()

            import uuid

            uid = str(uuid.uuid4())
            event.add("uid", uid)
            event.add("summary", summary)
            event.add("dtstart", start)
            event.add("dtend", end)

            if description:
                event.add("description", description)
            if location:
                event.add("location", location)

            # Add timestamp
            event.add("dtstamp", datetime.now())

            cal.add_component(event)

            # Save to calendar
            calendar.save_event(cal.to_ical().decode("utf-8"))

            logger.info(f"Created event {uid} in calendar {calendar_url}")
            return uid

        except Exception as e:
            logger.error(f"Failed to create event: {e}")
            raise

    def delete_event(self, calendar_url: str, uid: str) -> None:
        """Delete an event by UID.

        Args:
            calendar_url: Calendar URL
            uid: Event UID
        """
        calendar = self.get_calendar_by_url(calendar_url)
        if not calendar:
            raise ValueError(f"Calendar not found: {calendar_url}")

        try:
            # Find and delete the event
            events = calendar.events()

            for event in events:
                try:
                    ical = Calendar.from_ical(event.data)
                    for component in ical.walk():
                        if component.name == "VEVENT":
                            event_uid = str(component.get("uid", ""))
                            if event_uid == uid:
                                event.delete()
                                logger.info(f"Deleted event {uid} from calendar {calendar_url}")
                                return

                except Exception as e:
                    logger.warning(f"Failed to parse event during deletion: {e}")
                    continue

            raise ValueError(f"Event with UID {uid} not found in calendar")

        except Exception as e:
            logger.error(f"Failed to delete event: {e}")
            raise
