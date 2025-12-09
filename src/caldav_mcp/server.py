"""FastMCP server setup for CalDAV operations."""

import asyncio
import logging
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from .client import CalDAVAccount
from .config import Settings
from .tools.calendars import list_calendars_tool
from .tools.events import create_event_tool, delete_event_tool, list_events_tool

logger = logging.getLogger(__name__)

# Global accounts list (initialized in setup)
_accounts: list[CalDAVAccount] = []

# Transport security settings for external access
_transport_security = TransportSecuritySettings(
    enable_dns_rebinding_protection=True,
    allowed_hosts=[
        "127.0.0.1:*",
        "localhost:*",
        "[::1]:*",
        "codex-agent.duckdns.org",
        "codex-agent.duckdns.org:*",
        "5mlt.l.time4vps.cloud:*",
    ],
    allowed_origins=[
        "http://127.0.0.1:*",
        "http://localhost:*",
        "http://[::1]:*",
        "https://codex-agent.duckdns.org",
        "https://5mlt.l.time4vps.cloud:*",
    ],
)


async def initialize_accounts() -> list[CalDAVAccount]:
    """Initialize all CalDAV accounts from configuration.

    Returns:
        List of initialized CalDAV accounts
    """
    global _accounts

    if _accounts:
        return _accounts

    settings = Settings()
    account_configs = settings.parse_accounts()

    logger.info(f"Initializing {len(account_configs)} CalDAV account(s)")

    accounts = []
    for config in account_configs:
        account = CalDAVAccount(config)
        # Run synchronous connect in thread pool
        await asyncio.to_thread(account.connect)
        accounts.append(account)

    _accounts = accounts
    return accounts


def create_mcp_server() -> FastMCP:
    """Create and configure the FastMCP server with all tools.

    Returns:
        Configured FastMCP server instance
    """
    mcp = FastMCP("caldav-mcp", transport_security=_transport_security)

    @mcp.tool(description="List all calendars from all configured accounts")
    async def list_calendars() -> list[dict[str, Any]]:
        """List all calendars from all configured accounts.

        Returns a list of calendars with account name, calendar name, and URL.
        """
        accounts = await initialize_accounts()
        return await list_calendars_tool(accounts)

    @mcp.tool(
        description=(
            "List all events between start and end date in the calendar specified by its URL. "
            "If end is not provided, defaults to 30 days after start."
        )
    )
    async def list_events(
        calendar_url: str,
        start: str,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        """List events in a calendar within a date range.

        Args:
            calendar_url: The calendar URL from list-calendars
            start: Start date in ISO 8601 format (e.g., 2025-11-27 or 2025-11-27T00:00:00Z)
            end: End date in ISO 8601 format. If not provided, defaults to 30 days after start

        Returns:
            List of events with uid, summary, start, end, description, and location
        """
        accounts = await initialize_accounts()
        return await list_events_tool(accounts, calendar_url, start, end)

    @mcp.tool(description="Create a new calendar event in the specified calendar")
    async def create_event(
        calendar_url: str,
        summary: str,
        start: str,
        end: str,
        description: str | None = None,
        location: str | None = None,
    ) -> str:
        """Create a new calendar event.

        Args:
            calendar_url: The calendar URL from list-calendars
            summary: Event summary/title
            start: Start datetime in ISO 8601 format (e.g., 2025-11-27T10:00:00)
            end: End datetime in ISO 8601 format (e.g., 2025-11-27T11:00:00)
            description: Optional event description
            location: Optional event location

        Returns:
            UID of the created event
        """
        accounts = await initialize_accounts()
        return await create_event_tool(
            accounts, calendar_url, summary, start, end, description, location
        )

    @mcp.tool(description="Delete an event by its UID from the specified calendar")
    async def delete_event(calendar_url: str, uid: str) -> str:
        """Delete an event by UID.

        Args:
            calendar_url: The calendar URL from list-calendars
            uid: Event UID to delete

        Returns:
            Success message
        """
        accounts = await initialize_accounts()
        return await delete_event_tool(accounts, calendar_url, uid)

    return mcp
