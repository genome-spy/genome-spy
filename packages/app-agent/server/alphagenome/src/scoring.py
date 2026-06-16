"""Low-level inference primitives for AlphaGenome."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import numpy as np
import torch

if TYPE_CHECKING:
    from alphagenome_pytorch import AlphaGenome

_ORGANISM_INDEX: dict[str, int] = {"human": 0, "mouse": 1}


def seq_to_tensor(seq: str, device: str) -> torch.Tensor:
    """Convert a DNA string to a batched one-hot tensor.

    Returns:
        Float32 tensor of shape ``(1, L, 4)`` on the requested device.
    """
    from alphagenome_pytorch.utils.sequence import sequence_to_onehot

    arr = sequence_to_onehot(seq).astype(np.float32)
    return torch.from_numpy(arr).unsqueeze(0).to(device)


def get_head_tensor(
    out: dict[str, Any], head: str, resolution: int
) -> torch.Tensor | None:
    """Extract a head's output tensor at the given resolution.

    AlphaGenome heads come in two shapes: multi-resolution (a dict keyed by
    resolution int, e.g. ``{1: tensor, 128: tensor}``) and single-tensor
    (e.g. ``contact_maps``). This function normalises both to a single tensor,
    returning ``None`` when the head or resolution is absent.

    Returns:
        Tensor of shape ``(1, positions, n_tracks)`` or ``None``.
    """
    t = out.get(head)
    if t is None:
        return None
    if isinstance(t, dict):
        return t.get(resolution)
    return t


def run_forward(
    model: AlphaGenome,
    device: str,
    seqs: list[str],
    organism: str,
) -> list[dict[str, Any]]:
    """Run a forward pass for each sequence and return the raw output dicts.

    Sequences are processed one at a time because AlphaGenome is memory-intensive
    at 131K context; batching multiple sequences would exceed available VRAM.

    Args:
        model: Loaded AlphaGenome instance in eval mode.
        seqs: Uppercase DNA strings, each exactly 131 072 bp.
        organism: ``"human"`` or ``"mouse"``.

    Returns:
        One output dict per sequence, keyed by head name.
    """
    org_idx = torch.tensor([_ORGANISM_INDEX[organism]], dtype=torch.long, device=device)
    outputs: list[dict[str, Any]] = []
    with torch.inference_mode():
        for seq in seqs:
            x = seq_to_tensor(seq, device)
            outputs.append(model(x, org_idx))
    return outputs


def _window_diff(
    ref_np: np.ndarray, alt_np: np.ndarray, resolution: int, window_size: int
) -> list[float]:
    """Sum alt − ref over a centered window, returning one float per track channel.

    The window is measured in base pairs and converted to bins using ``resolution``.
    A minimum of one bin is enforced so a very small ``window_size`` never
    collapses to an empty slice.
    """
    mid = ref_np.shape[0] // 2
    half_bins = max(1, (window_size // resolution) // 2)
    sl = slice(mid - half_bins, mid + half_bins + 1)
    return (alt_np[sl] - ref_np[sl]).sum(axis=0).tolist()


def center_window_score(
    ref_out: dict[str, Any],
    alt_out: dict[str, Any],
    heads: list[str],
    resolution: int,
    window_size: int,
) -> dict[str, list[float]]:
    """Compute per-track alt − ref scores summed over a center window.

    The window is centered on the middle of the 131K sequence, which is where
    the variant should be placed by the client. Padding channels (zeros in the
    model outputs) are included in the returned arrays.

    Args:
        ref_out: Forward-pass output dict for the reference sequence.
        alt_out: Forward-pass output dict for the alternate sequence.
        heads: Head names to score (e.g. ``["atac", "cage"]``).
        resolution: Which resolution tensor to use within each head (1 or 128).
        window_size: Width of the center window in base pairs.

    Returns:
        Dict mapping head name to a list of floats, one per output track channel.
    """
    scores: dict[str, list[float]] = {}
    for head in heads:
        ref_t = get_head_tensor(ref_out, head, resolution)
        alt_t = get_head_tensor(alt_out, head, resolution)
        if ref_t is None or alt_t is None:
            continue
        ref_np = ref_t[0].float().cpu().numpy()
        alt_np = alt_t[0].float().cpu().numpy()
        scores[head] = _window_diff(ref_np, alt_np, resolution, window_size)
    return scores


_SPLICE_HEADS = ("splice_sites", "splice_site_usage", "splice_junctions")
_ISM_BASES = "ACGT"


def splice_score(
    ref_out: dict[str, Any],
    alt_out: dict[str, Any],
    resolution: int,
    window_size: int,
) -> dict[str, list[float]]:
    """Compute per-channel splice head scores plus a weighted composite.

    Scores the three splice heads (splice_sites, splice_site_usage,
    splice_junctions) using center-window alt − ref diffs, then combines them
    with the formula from the AlphaGenome paper:

        composite = max_abs(splice_sites) + max_abs(splice_site_usage)
                    + max_abs(splice_junctions) / 5

    The ``/ 5`` down-weights junctions because they produce larger magnitudes.

    Returns:
        Dict with per-channel floats for each splice head that was present,
        plus ``"splice_score": [composite]`` (single-element list).
    """
    scores: dict[str, list[float]] = {}
    for head in _SPLICE_HEADS:
        ref_t = get_head_tensor(ref_out, head, resolution)
        alt_t = get_head_tensor(alt_out, head, resolution)
        if ref_t is None or alt_t is None:
            continue
        ref_np = ref_t[0].float().cpu().numpy()
        alt_np = alt_t[0].float().cpu().numpy()
        scores[head] = _window_diff(ref_np, alt_np, resolution, window_size)

    def _max_abs(vals: list[float]) -> float:
        return max(vals, key=abs) if vals else 0.0

    composite = (
        _max_abs(scores.get("splice_sites", []))
        + _max_abs(scores.get("splice_site_usage", []))
        + _max_abs(scores.get("splice_junctions", [])) / 5.0
    )
    scores["splice_score"] = [composite]
    return scores


def compute_ism_matrix(
    ref_out: dict[str, Any],
    alt_outs: list[dict[str, Any]],
    ref_bases: str,
    heads: list[str],
    resolution: int,
    window_size: int,
) -> dict[str, list]:
    """Compute per-position, per-base, per-track ISM scores.

    ``alt_outs`` must be ordered position-major, base-minor (ACGT order,
    skipping the reference base at each position) — exactly the order produced
    by ``decode_ism`` in tasks.py.

    Ref tensors are converted to numpy once so the GPU→CPU copy is paid only
    once regardless of ISM window width.

    Args:
        ref_out: Forward-pass output dict for the reference sequence.
        alt_outs: Forward-pass output dicts for alternate sequences,
            ``3 × len(ref_bases)`` entries total.
        ref_bases: Reference bases at the ISM positions (``seq[ism_start:ism_end]``).
        heads: Head names to score.
        resolution: Which resolution tensor to use within each head (1 or 128).
        window_size: Center window width in base pairs for alt − ref scoring.

    Returns:
        Dict mapping head name to a ``(n_positions, 4, n_tracks)`` nested list.
        Base axis: ACGT order; reference base slot at each position is all zeros.
    """
    ref_nps: dict[str, np.ndarray | None] = {}
    for h in heads:
        t = get_head_tensor(ref_out, h, resolution)
        ref_nps[h] = t[0].float().cpu().numpy() if t is not None else None

    result: dict[str, list] = {h: [] for h in heads}
    alt_idx = 0

    for ref_base in ref_bases:
        pos_per_head: dict[str, list] = {h: [] for h in heads}

        for base in _ISM_BASES:
            if base == ref_base:
                for h in heads:
                    n_tracks = ref_nps[h].shape[-1] if ref_nps[h] is not None else 0
                    pos_per_head[h].append([0.0] * n_tracks)
            else:
                alt_out = alt_outs[alt_idx]
                alt_idx += 1
                for h in heads:
                    if ref_nps[h] is None:
                        pos_per_head[h].append([])
                        continue
                    alt_t = get_head_tensor(alt_out, h, resolution)
                    if alt_t is None:
                        pos_per_head[h].append([])
                        continue
                    alt_np = alt_t[0].float().cpu().numpy()
                    pos_per_head[h].append(
                        _window_diff(ref_nps[h], alt_np, resolution, window_size)
                    )

        for h in heads:
            result[h].append(pos_per_head[h])

    return result


def extract_embeddings(
    model: AlphaGenome,
    device: str,
    seq: str,
    organism: str,
) -> np.ndarray:
    """Return 128 bp trunk embeddings for a single sequence.

    Returns:
        Float32 numpy array of shape ``(1024, 3072)``.
    """
    org_idx = torch.tensor([_ORGANISM_INDEX[organism]], dtype=torch.long, device=device)
    x = seq_to_tensor(seq, device)
    with torch.inference_mode():
        emb = model.encode(x, org_idx, resolutions=(128,))
    return emb["embeddings_128bp"][0].float().cpu().numpy()
