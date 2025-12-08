"""Configuration management for CalDAV MCP server."""

import os
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class CalDAVAccountConfig(BaseSettings):
    """Configuration for a single CalDAV account."""

    name: str
    base_url: str
    username: str
    password: str


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Server configuration
    port: int = Field(default=8000, description="HTTP server port")
    host: str = Field(default="127.0.0.1", description="HTTP server host")

    @staticmethod
    def parse_accounts() -> list[CalDAVAccountConfig]:
        """Parse CalDAV accounts from environment variables.

        Supports numbered accounts: CALDAV_1_*, CALDAV_2_*, etc.
        Falls back to legacy single account: CALDAV_BASE_URL, CALDAV_USERNAME, CALDAV_PASSWORD
        """
        accounts = []

        # Support numbered accounts: CALDAV_1_*, CALDAV_2_*, etc.
        for i in range(1, 11):  # Support up to 10 accounts
            prefix = f"CALDAV_{i}_"
            base_url = os.getenv(f"{prefix}BASE_URL")
            username = os.getenv(f"{prefix}USERNAME")
            password = os.getenv(f"{prefix}PASSWORD")
            name = os.getenv(f"{prefix}NAME", f"Account {i}")

            if base_url and username and password:
                accounts.append(
                    CalDAVAccountConfig(
                        name=name,
                        base_url=base_url,
                        username=username,
                        password=password,
                    )
                )

        # Fallback to legacy single account format
        if not accounts:
            base_url = os.getenv("CALDAV_BASE_URL")
            username = os.getenv("CALDAV_USERNAME")
            password = os.getenv("CALDAV_PASSWORD")
            name = os.getenv("CALDAV_NAME", "Default")

            if base_url and username and password:
                accounts.append(
                    CalDAVAccountConfig(
                        name=name,
                        base_url=base_url,
                        username=username,
                        password=password,
                    )
                )

        if not accounts:
            raise ValueError(
                "No CalDAV accounts configured. Set CALDAV_1_BASE_URL, "
                "CALDAV_1_USERNAME, CALDAV_1_PASSWORD, CALDAV_1_NAME environment variables."
            )

        return accounts


# Global settings instance
settings = Settings()
