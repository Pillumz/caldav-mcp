# CalDAV MCP Server

A Python-based MCP (Model Context Protocol) server for CalDAV calendar operations with multi-account support.

## Features

- **Multi-account support**: Connect to multiple CalDAV accounts simultaneously
- **Calendar operations**: List calendars, view events, create events, and delete events
- **Flexible transport**: Supports both stdio and HTTP/SSE modes
- **Standards-based**: Uses standard CalDAV protocol and iCalendar format

## Tools

### list-calendars

List all calendars from all configured accounts.

**Returns:**
- `account`: Account name
- `name`: Calendar name
- `url`: Calendar URL (use this for other operations)

### list-events

List events in a calendar within a date range.

**Parameters:**
- `calendar_url` (required): Calendar URL from list-calendars
- `start` (required): Start date in ISO 8601 format (e.g., 2025-11-27 or 2025-11-27T00:00:00Z)
- `end` (optional): End date in ISO 8601 format. Defaults to 30 days after start if not provided

**Returns:**
- `uid`: Event unique identifier
- `summary`: Event title
- `start`: Event start datetime
- `end`: Event end datetime
- `description`: Event description (if any)
- `location`: Event location (if any)

### create-event

Create a new calendar event.

**Parameters:**
- `calendar_url` (required): Calendar URL from list-calendars
- `summary` (required): Event title
- `start` (required): Start datetime in ISO 8601 format
- `end` (required): End datetime in ISO 8601 format
- `description` (optional): Event description
- `location` (optional): Event location

**Returns:**
- Event UID

### delete-event

Delete an event by its UID.

**Parameters:**
- `calendar_url` (required): Calendar URL from list-calendars
- `uid` (required): Event UID to delete

**Returns:**
- Success message

## Configuration

Create a `.env` file with your CalDAV account credentials:

```env
# Account 1
CALDAV_1_NAME=CDM
CALDAV_1_BASE_URL=https://caldav.yandex.ru
CALDAV_1_USERNAME=user@example.com
CALDAV_1_PASSWORD=app-password

# Account 2
CALDAV_2_NAME=Personal
CALDAV_2_BASE_URL=https://caldav.yandex.ru
CALDAV_2_USERNAME=personal@example.com
CALDAV_2_PASSWORD=app-password

# Server configuration
PORT=9081
HOST=127.0.0.1
```

## Installation

Install dependencies using uv:

```fish
uv sync
```

## Usage

### Stdio Mode (for MCP clients)

```fish
uv run python -m caldav_mcp stdio
```

### HTTP Mode (for testing/debugging)

```fish
uv run python -m caldav_mcp http --port 9081 --host 127.0.0.1
```

Or use the Makefile:

```fish
make run
```

### Systemd Service

Install and start as a systemd service:

```fish
make service-install
make service-start
```

View logs:

```fish
make service-logs
```

## Development

### Run tests

```fish
make test
```

### Clean build artifacts

```fish
make clean
```

## Architecture

```
/opt/mcp/caldav-mcp/
├── src/
│   └── caldav_mcp/
│       ├── __init__.py
│       ├── __main__.py      # Entry point with stdio/http modes
│       ├── server.py        # FastMCP server setup
│       ├── config.py        # Settings from .env
│       ├── client.py        # CalDAV client wrapper
│       └── tools/
│           ├── __init__.py
│           ├── calendars.py # list-calendars tool
│           └── events.py    # list-events, create-event, delete-event tools
├── .env                     # Configuration
├── pyproject.toml
├── Makefile
└── caldav-mcp.service
```

## License

MIT
