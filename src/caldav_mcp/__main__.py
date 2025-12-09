"""Entry point for CalDAV MCP server supporting stdio and HTTP modes."""

import argparse
import asyncio
import logging
import sys

import mcp.server.stdio
from dotenv import load_dotenv

from .config import Settings
from .server import create_mcp_server

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stderr,
)

logger = logging.getLogger(__name__)


async def run_stdio():
    """Run the MCP server in stdio mode."""
    logger.info("Starting CalDAV MCP server in stdio mode")

    mcp = create_mcp_server()
    await mcp.run_stdio_async()


async def run_http(host: str = "127.0.0.1", port: int = 9081):
    """Run the MCP server in HTTP/SSE mode.

    Args:
        host: Host to bind to (default: 127.0.0.1)
        port: Port to bind to (default: 9081)
    """
    logger.info(f"Starting CalDAV MCP server in HTTP mode on {host}:{port}")

    mcp = create_mcp_server()

    # Configure host/port via settings
    mcp.settings.host = host
    mcp.settings.port = port

    # Run with SSE transport
    await mcp.run_sse_async()


def main():
    """Main entry point with argument parsing."""
    parser = argparse.ArgumentParser(description="CalDAV MCP Server")
    parser.add_argument(
        "mode",
        nargs="?",
        choices=["stdio", "http"],
        default="stdio",
        help="Server mode: stdio (default) or http",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind to in HTTP mode (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to bind to in HTTP mode (default: from .env or 9081)",
    )

    args = parser.parse_args()

    # Load settings for port default
    settings = Settings()
    port = args.port if args.port is not None else settings.port

    try:
        if args.mode == "http":
            asyncio.run(run_http(args.host, port))
        else:
            asyncio.run(run_stdio())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
