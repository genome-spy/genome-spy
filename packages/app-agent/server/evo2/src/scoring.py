"""Low-level inference primitives for Evo2.

Thin wrappers around model outputs — kept separate from api.py and tasks.py
so they can be unit-tested without a GPU.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import torch

_RC_TABLE = str.maketrans("ACGTNacgtn", "TGCANtgcan")


def reverse_complement(seq: str) -> str:
    """Return the reverse complement of a DNA sequence."""
    return seq.translate(_RC_TABLE)[::-1]


def prepare_batch(
    seqs: list[str],
    tokenizer: Any,
    prepend_bos: bool = False,
    device: str = "cuda:0",
) -> tuple[torch.Tensor, list[int]]:
    """Tokenize and pad a list of sequences into a batch tensor.

    Returns:
        (input_ids, seq_lengths) where input_ids has shape [batch, max_len]
        and seq_lengths holds the original unpadded lengths.
    """
    seq_lengths = [len(s) for s in seqs]
    max_len = max(seq_lengths)
    input_ids = []
    for seq in seqs:
        padding = [tokenizer.pad_id] * (max_len - len(seq))
        tokens = (
            ([tokenizer.eod_id] if prepend_bos else [])
            + tokenizer.tokenize(seq)
            + padding
        )
        input_ids.append(
            torch.tensor(tokens, dtype=torch.long, device=device).unsqueeze(0)
        )
    return torch.cat(input_ids, dim=0), seq_lengths


def run_forward(
    model: Any,
    tokenizer: Any,
    device: str,
    seqs: list[str],
    layer_names: list[str] | None = None,
) -> tuple[torch.Tensor, list[int], torch.Tensor, dict[str, torch.Tensor]]:
    """Single forward pass over all sequences, optionally capturing layer activations.

    Registers temporary forward hooks on the requested layers. Handles layers
    that return tuples by taking the first element (the activation tensor).

    Args:
        layer_names: Module paths understood by nn.Module.get_submodule, e.g.
            ['blocks.26']. When None or empty, no hooks are registered.

    Returns:
        (logits, seq_lengths, input_ids, embeddings) where embeddings maps each
        requested layer name to its activation tensor (batch, seq_len, hidden_dim),
        or an empty dict when no layers were requested.
    """
    input_ids, seq_lengths = prepare_batch(seqs, tokenizer, device=device)

    embeddings: dict[str, torch.Tensor] = {}
    handles: list = []

    if layer_names:

        def hook_fn(name: str):
            def hook(_, __, output):
                acts = output[0] if isinstance(output, tuple) else output
                embeddings[name] = acts.detach()

            return hook

        for name in layer_names:
            handles.append(
                model.get_submodule(name).register_forward_hook(hook_fn(name))
            )

    try:
        with torch.inference_mode():
            logits, _ = model.forward(input_ids)
    finally:
        for h in handles:
            h.remove()

    return logits, seq_lengths, input_ids, embeddings


def logits_to_logprobs(
    logits: torch.Tensor,
    input_ids: torch.Tensor,
) -> torch.Tensor:
    """Per-position log-prob of each input token. Shape (batch, len-1).

    Position i holds log_p(token_{i+1} | token_0 … token_i).
    """
    log_probs = torch.log_softmax(logits, dim=-1)
    log_probs = log_probs[:, :-1, :]
    target_ids = input_ids[:, 1:].unsqueeze(-1)
    return torch.gather(log_probs, 2, target_ids).squeeze(-1)


def scores_from_logits(
    logits: torch.Tensor,
    seq_lengths: list[int],
    input_ids: torch.Tensor,
    reduce: str,
) -> list[float]:
    """Reduce per-position log-probs to one scalar per sequence."""
    logprobs = logits_to_logprobs(logits, input_ids)
    reduce_fn = torch.mean if reduce == "mean" else torch.sum
    return [
        float(reduce_fn(logprobs[i, : seq_lengths[i]])) for i in range(logits.shape[0])
    ]


def logits_to_entropies(
    logits: torch.Tensor,
    seq_lengths: list[int],
) -> list[np.ndarray]:
    """Per-position Shannon entropy. Returns one float32 array per sequence."""
    log_probs = torch.log_softmax(logits, dim=-1)
    entropy = -(torch.exp(log_probs) * log_probs).sum(-1)
    entropy_np = entropy.float().cpu().numpy()
    return [entropy_np[i, : seq_lengths[i]] for i in range(len(seq_lengths))]
