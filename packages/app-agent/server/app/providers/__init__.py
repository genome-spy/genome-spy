from __future__ import annotations


class ProviderError(RuntimeError):
    """Raised when the upstream provider returns an invalid response."""
