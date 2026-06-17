"""BatchTopKTiedSAE model definition and checkpoint loader.

Adapted from the Goodfire Evo-2-Layer-26-Mixed notebook.
"""

from __future__ import annotations

from math import prod
from pathlib import Path

import torch
import torch.nn as nn


class BatchTopKTiedSAE(nn.Module):
    """Sparse autoencoder with batch top-k sparsity and tied encoder/decoder weights."""

    def __init__(
        self,
        d_in: int,
        d_hidden: int,
        k: int,
        device: str,
        dtype: torch.dtype,
        tiebreaker_epsilon: float = 1e-6,
    ) -> None:
        super().__init__()
        self.d_in = d_in
        self.d_hidden = d_hidden
        self.k = k

        _INIT_SCALE = 0.1
        w_mat = torch.randn((d_in, d_hidden))
        norms = torch.linalg.norm(w_mat, dim=0, ord=2, keepdim=True)
        w_mat = _INIT_SCALE * w_mat / norms
        self.W = nn.Parameter(w_mat)
        self.b_enc = nn.Parameter(torch.zeros(self.d_hidden))
        self.b_dec = nn.Parameter(torch.zeros(self.d_in))
        self.tiebreaker = torch.linspace(0, tiebreaker_epsilon, d_hidden)
        self.to(device, dtype)

    def encode(self, x: torch.Tensor, tiebreak: bool = False) -> torch.Tensor:
        """Encode activations to sparse features via batch top-k selection.

        Selects the top k × (number of non-feature dimensions) values globally
        across the input, zeroing the rest. Total non-zeros equals k × seq_len
        for a 2-D input.
        """
        f = nn.functional.relu(x @ self.W + self.b_enc)
        if tiebreak:
            f = f + self.tiebreaker.broadcast_to(f.shape)
        *input_shape, _ = f.shape
        numel = self.k * prod(input_shape)
        topk = torch.topk(f.flatten(), numel, dim=-1)
        return (
            torch.zeros_like(f.flatten())
            .scatter(-1, topk.indices, topk.values)
            .reshape(f.shape)
        )

    def decode(self, feat: torch.Tensor) -> torch.Tensor:
        """Decode sparse features back to the input space."""
        return feat @ self.W.T + self.b_dec

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Return (reconstruction, sparse_features) for input x."""
        f = self.encode(x)
        return self.decode(f), f


def load_sae(path: str | Path, device: str) -> BatchTopKTiedSAE:
    """Load a BatchTopKTiedSAE checkpoint, inferring dimensions from the state dict.

    Args:
        path: Filesystem path to the ``.pt`` checkpoint file.
        device: PyTorch device string to move the loaded model to.
    """
    raw = torch.load(path, weights_only=True, map_location="cpu")
    state = {
        k.replace("_orig_mod.", "").replace("module.", ""): v for k, v in raw.items()
    }
    d_in = state["b_dec"].shape[0]
    d_hidden = state["b_enc"].shape[0]
    sae = BatchTopKTiedSAE(d_in, d_hidden, k=64, device=device, dtype=torch.bfloat16)
    sae.load_state_dict(state)
    sae.eval()
    return sae
