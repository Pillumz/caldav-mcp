.PHONY: install run dev test clean service-install service-start service-stop service-restart service-logs

# Package name (override in each project)
MODULE := caldav_mcp
PORT := 9081

install:
	uv sync

run:
	uv run python -m $(MODULE) http --port $(PORT)

dev:
	uv run python -m $(MODULE) http --port $(PORT)

stdio:
	uv run python -m $(MODULE) stdio

test:
	uv run pytest

clean:
	rm -rf .venv __pycache__ .pytest_cache .ruff_cache

# Systemd service management
service-install:
	sudo cp caldav-mcp.service /etc/systemd/system/
	sudo systemctl daemon-reload
	sudo systemctl enable caldav-mcp

service-start:
	sudo systemctl start caldav-mcp

service-stop:
	sudo systemctl stop caldav-mcp

service-restart:
	sudo systemctl restart caldav-mcp

service-logs:
	journalctl -u caldav-mcp -f
