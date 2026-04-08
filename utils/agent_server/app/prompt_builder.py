from __future__ import annotations

import json

from .models import ProviderRequest


def build_provider_messages(request: ProviderRequest) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": request.system_prompt},
        {
            "role": "system",
            "content": (
                "Current GenomeSpy context snapshot:\n"
                + json.dumps(request.context, indent=2, ensure_ascii=True)
            ),
        },
    ]

    for message in request.history:
        messages.append(
            {
                "role": message.role,
                "content": message.text,
            }
        )

    messages.append({"role": "user", "content": request.message})
    return messages
