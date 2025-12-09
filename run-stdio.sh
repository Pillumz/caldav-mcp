#!/bin/bash
cd /opt/mcp/caldav-mcp
source .env
exec /opt/mcp/caldav-mcp/.venv/bin/python -m caldav_mcp stdio
