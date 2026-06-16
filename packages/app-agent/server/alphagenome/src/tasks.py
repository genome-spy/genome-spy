"""Batch types and decode/encode logic for all AlphaGenome tasks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np

from schema import (
    EmbedRequest,
    EmbedResponse,
    ISMRequest,
    ISMResponse,
    PredictRequest,
    PredictResponse,
    ScoreRequest,
    ScoreResponse,
)
from scoring import center_window_score, compute_ism_matrix, get_head_tensor, splice_score

_SPLICE_HEADS = ["splice_sites", "splice_site_usage", "splice_junctions"]


@dataclass
class AlphaGenomeBatch:
    """Unified batch descriptor passed from decode_request through predict to encode_response."""

    seqs: list[str]
    organism: str
    heads: list[str]
    resolution: int
    task: Literal["predict", "score", "embed", "ism"]
    n_pairs: int = 0
    window_size: int = 501
    scorer: str = "window"
    # ISM-only fields
    ism_start: int = 0
    ism_end: int = 0
    ism_ref_bases: str = ""


# ── decode ────────────────────────────────────────────────────────────────────


def decode_predict(req: PredictRequest) -> AlphaGenomeBatch:
    """Build a batch for raw track prediction."""
    return AlphaGenomeBatch(
        seqs=[req.seq],
        organism=req.organism,
        heads=req.heads,
        resolution=req.resolution,
        task="predict",
    )


def decode_score(req: ScoreRequest) -> AlphaGenomeBatch:
    """Build a batch for variant effect scoring.

    Interleaves ref and alt so they pair up in encode_score:
    ``[ref0, alt0, ref1, alt1, …]``.

    When ``scorer == "splice"``, heads are overridden to the three splice heads
    regardless of what the caller specified.
    """
    seqs = [s for pair in req.pairs for s in (pair.ref, pair.alt)]
    heads = _SPLICE_HEADS if req.scorer == "splice" else req.heads
    return AlphaGenomeBatch(
        seqs=seqs,
        organism=req.organism,
        heads=heads,
        resolution=req.resolution,
        task="score",
        n_pairs=len(req.pairs),
        window_size=req.window_size,
        scorer=req.scorer,
    )


def decode_ism(req: ISMRequest) -> AlphaGenomeBatch:
    """Build a batch for in-silico mutagenesis.

    Generates all single-nucleotide substitutions within ``[ism_start, ism_end)``.
    ``seqs[0]`` is the reference; ``seqs[1:]`` are the alternates ordered
    position-major, base-minor (ACGT order, skipping the reference base at each
    position).  This ordering is consumed by ``compute_ism_matrix`` in scoring.py.
    """
    ref = req.seq
    alt_seqs: list[str] = []
    for i in range(req.ism_end - req.ism_start):
        abs_pos = req.ism_start + i
        for base in "ACGT":
            if base != ref[abs_pos]:
                alt_seqs.append(ref[:abs_pos] + base + ref[abs_pos + 1:])
    return AlphaGenomeBatch(
        seqs=[ref] + alt_seqs,
        organism=req.organism,
        heads=req.heads,
        resolution=req.resolution,
        task="ism",
        window_size=req.window_size,
        ism_start=req.ism_start,
        ism_end=req.ism_end,
        ism_ref_bases=ref[req.ism_start:req.ism_end],
    )


def decode_embed(req: EmbedRequest) -> AlphaGenomeBatch:
    """Build a batch for trunk embedding extraction."""
    return AlphaGenomeBatch(
        seqs=[req.seq],
        organism=req.organism,
        heads=[],
        resolution=128,
        task="embed",
    )


# ── encode ────────────────────────────────────────────────────────────────────


def encode_predict(
    outputs_list: list[dict[str, Any]], meta: AlphaGenomeBatch
) -> PredictResponse:
    """Convert raw model outputs to a PredictResponse."""
    tracks: dict[str, list[list[list[float]]]] = {h: [] for h in meta.heads}
    for out in outputs_list:
        for head in meta.heads:
            t = get_head_tensor(out, head, meta.resolution)
            if t is not None:
                tracks[head].append(t[0].float().cpu().tolist())
    return PredictResponse(tracks=tracks)


def encode_score(
    outputs_list: list[dict[str, Any]], meta: AlphaGenomeBatch
) -> ScoreResponse:
    """Convert interleaved ref/alt outputs to a ScoreResponse."""
    if meta.scorer == "splice":
        scores = [
            splice_score(
                outputs_list[i * 2],
                outputs_list[i * 2 + 1],
                meta.resolution,
                meta.window_size,
            )
            for i in range(meta.n_pairs)
        ]
    else:
        scores = [
            center_window_score(
                outputs_list[i * 2],
                outputs_list[i * 2 + 1],
                meta.heads,
                meta.resolution,
                meta.window_size,
            )
            for i in range(meta.n_pairs)
        ]
    return ScoreResponse(scores=scores)


def encode_ism(output: tuple, meta: AlphaGenomeBatch) -> ISMResponse:
    """Convert (ref_out, alt_outs) to an ISMResponse."""
    ref_out, alt_outs = output
    matrix = compute_ism_matrix(
        ref_out,
        alt_outs,
        meta.ism_ref_bases,
        meta.heads,
        meta.resolution,
        meta.window_size,
    )
    return ISMResponse(ism_matrix=matrix)


def encode_embed(emb: np.ndarray, meta: AlphaGenomeBatch) -> EmbedResponse:
    """Convert a ``(1024, 3072)`` embedding array to an EmbedResponse."""
    return EmbedResponse(embeddings_128bp=emb.tolist())
