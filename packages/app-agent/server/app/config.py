from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from importlib import resources

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Settings:
    model: str
    base_url: str
    api_key: str
    timeout_seconds: float
    system_prompt: str
    enable_streaming: bool


def describe_api_key_for_logs(api_key: str) -> str:
    """Describe an API key for safe log output.

    Replaces the raw key with its length and a short SHA-256 prefix so logs can
    distinguish values without exposing the secret itself.

    Args:
        api_key: Raw API key configured for the upstream provider.

    Returns:
        Log-safe key description that includes the key length and digest prefix.
    """
    digest = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    return "len=" + str(len(api_key)) + " sha256=" + digest[:12]


def load_default_system_prompt() -> str:
    """Load the bundled default system prompt text.

    Reads the relay's checked-in prompt template from the package resources and
    trims surrounding whitespace before returning it.
    """
    return resources.files(__package__).joinpath(
        "prompts/genomespy_system_prompt.md"
    ).read_text(encoding="utf-8").strip()


def load_settings() -> Settings:
    """Load relay settings from environment variables.

    Builds the immutable runtime settings object used by the relay, applying
    defaults for optional values and validating the API style.

    Returns:
        Settings object populated from the current process environment.

    Raises:
        ValueError: If an environment variable has an invalid value.
    """
    api_key_env = os.environ.get("GENOMESPY_AGENT_API_KEY")
    api_key = api_key_env if api_key_env is not None else "ollama"
    settings = Settings(
        model=os.environ["GENOMESPY_AGENT_MODEL"],
        base_url=os.environ.get(
            "GENOMESPY_AGENT_BASE_URL", "http://127.0.0.1:11434/v1"
        ).rstrip("/"),
        api_key=api_key,
        timeout_seconds=float(
            os.environ.get("GENOMESPY_AGENT_TIMEOUT_SECONDS", "180")
        ),
        system_prompt=os.environ.get(
            "GENOMESPY_AGENT_SYSTEM_PROMPT", load_default_system_prompt()
        ),
        enable_streaming=_load_bool_env("GENOMESPY_AGENT_ENABLE_STREAMING", True),
    )

    logger.info(
        (
            "Loaded GenomeSpy agent settings: "
            "base_url=%s model=%s api_key_source=%s api_key=%s "
            "streaming=%s timeout_seconds=%s"
        ),
        settings.base_url,
        settings.model,
        "GENOMESPY_AGENT_API_KEY" if api_key_env is not None else "default",
        describe_api_key_for_logs(settings.api_key),
        settings.enable_streaming,
        settings.timeout_seconds,
    )

    return settings


def _load_bool_env(name: str, default: bool) -> bool:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True

    if normalized in {"0", "false", "no", "off"}:
        return False

    raise ValueError(
        name + " must be one of: true, false, yes, no, on, off, 1, 0"
    )
