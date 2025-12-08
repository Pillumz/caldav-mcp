"""Tool for listing calendars."""

from typing import Any

from ..client import CalDAVAccount


async def list_calendars_tool(accounts: list[CalDAVAccount]) -> list[dict[str, Any]]:
    """List all calendars from all configured accounts.

    Args:
        accounts: List of CalDAV accounts

    Returns:
        List of calendar information dicts with account, name, and URL
    """
    result = []

    for account in accounts:
        for calendar in account.calendars:
            result.append(
                {
                    "account": calendar.account_name,
                    "name": calendar.name,
                    "url": calendar.url,
                }
            )

    return result
