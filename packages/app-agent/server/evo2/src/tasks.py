"""Batch types and decode/encode logic for all Evo2 tasks."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import ClassVar, Literal

import numpy as np
import torch
import torch.nn as nn
from pyfaidx import Fasta

from genome import extract_snp_windows
from sae import BatchTopKTiedSAE
from schema import (
    EmbedRequest,
    EmbedResponse,
    ExonRequest,
    ExonResponse,
    PairScore,
    SaeRequest,
    SaeResponse,
    ScoreRequest,
    ScoreResponse,
    SparseActivation,
)
from scoring import logits_to_entropies, reverse_complement, scores_from_logits

logger = logging.getLogger(__name__)


@dataclass
class Evo2Batch:
    """Batch for the score task.

    seqs layout:
      seqs[:n_forward]  — forward sequences (unique refs, then unique alts)
      seqs[n_forward:]  — RC sequences in the same order (only if rc_averaging)
    """

    task: ClassVar[Literal["score"]] = "score"
    seqs: list[str]
    n_forward: int
    reduce: Literal["mean", "sum"]
    include_entropy: bool
    n_ref: int
    ref_indexes: np.ndarray  # shape (n_items,); -1 for invalid coordinate variants
    alt_indexes: np.ndarray  # shape (n_items,)
    valid: list[bool] | None  # None = pairs mode (all valid)
    n_items: int


# ── decode ────────────────────────────────────────────────────────────────────


def decode_score(
    req: ScoreRequest,
    ref: Fasta | None = None,
    chrom_keys: set[str] | None = None,
) -> Evo2Batch:
    """Build an Evo2Batch from a validated score request.

    Dispatches to sequence mode (pairs) or coordinate mode (variants). In
    coordinate mode ref and chrom_keys are required.

    Args:
        req: Validated score request.
        ref: Open reference genome; required only in coordinate mode.
        chrom_keys: Chromosome keys from the FASTA index.

    Raises:
        RuntimeError: If coordinate mode is requested but no genome is loaded.
    """
    if req.pairs is not None:
        return _decode_pairs(req)
    return _decode_coords(req, ref, chrom_keys or set())


def _decode_pairs(req: ScoreRequest) -> Evo2Batch:
    """Build a batch from explicit ref/alt sequence pairs.

    Deduplicates ref and alt sequences independently so each unique string
    appears once in seqs. ref_indexes and alt_indexes map each input pair back
    to its deduplicated entry. When rc_averaging is set, RC sequences are
    appended after all forward sequences in the same ref-then-alt order.
    """
    if req.pairs is None:
        raise ValueError("_decode_pairs called with req.pairs=None")
    ref_seqs: list[str] = []
    ref_seq_to_idx: dict[str, int] = {}
    ref_indexes: list[int] = []
    alt_seqs: list[str] = []
    alt_seq_to_idx: dict[str, int] = {}
    alt_indexes: list[int] = []

    for pair in req.pairs:
        r, a = pair.ref.upper(), pair.alt.upper()
        if r not in ref_seq_to_idx:
            ref_seq_to_idx[r] = len(ref_seqs)
            ref_seqs.append(r)
        ref_indexes.append(ref_seq_to_idx[r])
        if a not in alt_seq_to_idx:
            alt_seq_to_idx[a] = len(alt_seqs)
            alt_seqs.append(a)
        alt_indexes.append(alt_seq_to_idx[a])

    forward_seqs = ref_seqs + alt_seqs
    rc = [reverse_complement(s) for s in forward_seqs] if req.rc_averaging else []
    return Evo2Batch(
        seqs=forward_seqs + rc,
        n_forward=len(forward_seqs),
        reduce=req.reduce,
        include_entropy=req.include_entropy,
        n_ref=len(ref_seqs),
        ref_indexes=np.array(ref_indexes),
        alt_indexes=np.array(alt_indexes),
        valid=None,
        n_items=len(req.pairs),
    )


def _decode_coords(
    req: ScoreRequest, ref: Fasta | None, chrom_keys: set[str]
) -> Evo2Batch:
    """Build a batch from genomic coordinates by extracting sequence windows.

    Attempts to extract a ref and alt window for each variant. Variants that
    fail coordinate lookup or ref-allele verification are marked invalid: a
    warning is logged, and ref_indexes/alt_indexes are set to -1. Valid
    variants are deduplicated the same way as in _decode_pairs. The valid list
    preserves the original variant order, including skipped entries.

    Raises:
        RuntimeError: If ref is None (no genome configured on the server).
    """
    if ref is None:
        raise RuntimeError(
            "Server has no reference genome configured. "
            "Send sequences directly via 'pairs' instead."
        )
    if req.variants is None:
        raise ValueError("_decode_coords called with req.variants=None")
    ref_seqs: list[str] = []
    ref_seq_to_idx: dict[str, int] = {}
    ref_indexes: list[int] = []
    alt_seqs: list[str] = []
    alt_seq_to_idx: dict[str, int] = {}
    alt_indexes: list[int] = []
    valid: list[bool] = []

    for v in req.variants:
        try:
            ref_seq, alt_seq = extract_snp_windows(
                ref,
                chrom_keys,
                v.chrom,
                v.pos,
                v.ref,
                v.alt,
                window_size=req.window_size,
            )
        except (KeyError, ValueError, AssertionError) as exc:
            logger.warning(
                "Skipping %s:%d %s>%s — %s", v.chrom, v.pos, v.ref, v.alt, exc
            )
            valid.append(False)
            ref_indexes.append(-1)
            alt_indexes.append(-1)
            continue

        if ref_seq not in ref_seq_to_idx:
            ref_seq_to_idx[ref_seq] = len(ref_seqs)
            ref_seqs.append(ref_seq)
        ref_indexes.append(ref_seq_to_idx[ref_seq])
        if alt_seq not in alt_seq_to_idx:
            alt_seq_to_idx[alt_seq] = len(alt_seqs)
            alt_seqs.append(alt_seq)
        alt_indexes.append(alt_seq_to_idx[alt_seq])
        valid.append(True)

    forward_seqs = ref_seqs + alt_seqs
    rc = [reverse_complement(s) for s in forward_seqs] if req.rc_averaging else []
    return Evo2Batch(
        seqs=forward_seqs + rc,
        n_forward=len(forward_seqs),
        reduce=req.reduce,
        include_entropy=req.include_entropy,
        n_ref=len(ref_seqs),
        ref_indexes=np.array(ref_indexes),
        alt_indexes=np.array(alt_indexes),
        valid=valid,
        n_items=len(req.variants),
    )


# ── encode helpers ────────────────────────────────────────────────────────────


def _avg_strands(fwd: list, rc: list | None) -> list:
    """Return element-wise average of fwd and rc, or fwd unchanged if rc is None."""
    return fwd if rc is None else [(f + r) / 2 for f, r in zip(fwd, rc, strict=True)]


def _compute_scores(
    logits: torch.Tensor,
    seq_lengths: list[int],
    input_ids: torch.Tensor,
    meta: Evo2Batch,
) -> tuple[list[float], list[float]]:
    """Compute log-likelihood scores for all unique sequences, RC-averaged if needed.

    Scores forward sequences (logits[:n_forward]) and, when rc_averaging was
    requested, RC sequences (logits[n_forward:]), then averages pairwise.

    Returns:
        (ref_scores, alt_scores) — one scalar per unique ref/alt sequence.
    """
    n = meta.n_forward
    has_rc = n < len(meta.seqs)
    fwd = scores_from_logits(logits[:n], seq_lengths[:n], input_ids[:n], meta.reduce)
    rc = (
        scores_from_logits(logits[n:], seq_lengths[n:], input_ids[n:], meta.reduce)
        if has_rc
        else None
    )
    all_scores = _avg_strands(fwd, rc)
    return all_scores[: meta.n_ref], all_scores[meta.n_ref :]


def _compute_entropies(
    logits: torch.Tensor,
    seq_lengths: list[int],
    meta: Evo2Batch,
) -> tuple[list | None, list | None]:
    """Compute per-position Shannon entropy, RC-averaged if needed.

    When rc_averaging is set, the RC entropy array is reversed before averaging
    because position i of the RC sequence corresponds to position L-1-i of the
    forward sequence.

    Returns:
        (ref_entropies, alt_entropies) as lists of numpy arrays, or (None, None)
        when include_entropy is False.
    """
    if not meta.include_entropy:
        return None, None
    n = meta.n_forward
    fwd = logits_to_entropies(logits[:n], seq_lengths[:n])
    if n < len(meta.seqs):
        rc = logits_to_entropies(logits[n:], seq_lengths[n:])
        all_ent = [(f + r[::-1]) / 2 for f, r in zip(fwd, rc, strict=True)]
    else:
        all_ent = fwd
    return all_ent[: meta.n_ref], all_ent[meta.n_ref :]


def _pair_score(
    ri: int,
    ai: int,
    ref_scores: list[float],
    alt_scores: list[float],
    ref_ent: list | None,
    alt_ent: list | None,
) -> PairScore:
    """Construct a PairScore using deduplicated score and entropy arrays.

    ri and ai are indexes into the unique-sequence arrays produced by
    _compute_scores and _compute_entropies, reflecting the deduplication
    applied during decode.
    """
    return PairScore(
        delta=alt_scores[ai] - ref_scores[ri],
        ref_score=ref_scores[ri],
        alt_score=alt_scores[ai],
        ref_entropy=ref_ent[ri].tolist() if ref_ent is not None else None,
        alt_entropy=alt_ent[ai].tolist() if alt_ent is not None else None,
    )


# ── encode ────────────────────────────────────────────────────────────────────


def encode_score(
    logits: torch.Tensor,
    seq_lengths: list[int],
    input_ids: torch.Tensor,
    meta: Evo2Batch,
) -> ScoreResponse:
    """Build a ScoreResponse from raw model logits.

    Computes per-sequence scores and optionally per-position entropy, then maps
    deduplicated results back to the original item order using the index arrays
    in meta. Invalid coordinate variants (meta.valid[i] is False) produce
    PairScore entries with all fields set to None.

    Args:
        logits: Raw model output of shape (batch, seq_len, vocab).
        seq_lengths: Unpadded lengths for each sequence in logits.
        input_ids: Token IDs corresponding to logits.
        meta: Batch metadata produced by decode_score.
    """
    ref_scores, alt_scores = _compute_scores(logits, seq_lengths, input_ids, meta)
    ref_ent, alt_ent = _compute_entropies(logits, seq_lengths, meta)

    result: list[PairScore] = []
    for i in range(meta.n_items):
        if meta.valid is not None and not meta.valid[i]:
            result.append(PairScore(delta=None, ref_score=None, alt_score=None))
            continue
        ri, ai = int(meta.ref_indexes[i]), int(meta.alt_indexes[i])
        result.append(_pair_score(ri, ai, ref_scores, alt_scores, ref_ent, alt_ent))

    return ScoreResponse(scores=result)


# ── embed / exon / sae batch ──────────────────────────────────────────────────

_EVO2_LAYER = "blocks.26"


@dataclass
class EmbedBatch:
    """Batch for embed, exon, and sae tasks.

    For the exon task seqs = forward_seqs + rc_seqs and n_forward = len(seqs) // 2.
    For embed and sae tasks seqs = forward_seqs only and n_forward = len(seqs).
    """

    seqs: list[str]
    n_forward: int
    layer_names: list[str]
    task: Literal["embed", "exon", "sae"]


# ── decode ────────────────────────────────────────────────────────────────────


def decode_embed(req: EmbedRequest) -> EmbedBatch:
    """Build a batch for raw embedding extraction."""
    return EmbedBatch(
        seqs=[s.upper() for s in req.seqs],
        n_forward=len(req.seqs),
        layer_names=req.layer_names,
        task="embed",
    )


def decode_exon(req: ExonRequest) -> EmbedBatch:
    """Build a batch for exon classification.

    Appends the reverse complement of every sequence so the classifier can
    receive the concatenated forward + RC final-token embedding.
    """
    fwd = [s.upper() for s in req.seqs]
    rc = [reverse_complement(s) for s in fwd]
    return EmbedBatch(
        seqs=fwd + rc,
        n_forward=len(fwd),
        layer_names=[_EVO2_LAYER],
        task="exon",
    )


def decode_sae(req: SaeRequest) -> EmbedBatch:
    """Build a batch for SAE feature extraction."""
    return EmbedBatch(
        seqs=[s.upper() for s in req.seqs],
        n_forward=len(req.seqs),
        layer_names=[_EVO2_LAYER],
        task="sae",
    )


# ── encode ────────────────────────────────────────────────────────────────────


def encode_embed(
    embeddings: dict[str, torch.Tensor],
    seq_lengths: list[int],
    meta: EmbedBatch,
) -> EmbedResponse:
    """Convert raw layer activation tensors to a nested-list response."""
    result: dict[str, list[list[list[float]]]] = {}
    for layer, emb in embeddings.items():
        result[layer] = [
            emb[i, : seq_lengths[i], :].float().cpu().tolist()
            for i in range(meta.n_forward)
        ]
    return EmbedResponse(embeddings=result)


def encode_exon(
    embeddings: dict[str, torch.Tensor],
    seq_lengths: list[int],
    meta: EmbedBatch,
    classifier: nn.Module,
) -> ExonResponse:
    """Classify each sequence as exonic using the forward + RC final-token embeddings.

    Concatenates the final-token embedding of the forward sequence with that of
    its reverse complement (shape 2 × hidden_dim), feeds the result through the
    pre-loaded exon classifier, and returns sigmoid probabilities.
    """
    emb = embeddings[_EVO2_LAYER]
    n = meta.n_forward
    probs: list[float] = []
    with torch.inference_mode():
        for i in range(n):
            fwd_tok = emb[i, seq_lengths[i] - 1, :].float()
            rc_tok = emb[i + n, seq_lengths[i] - 1, :].float()
            inp = torch.cat([fwd_tok, rc_tok]).unsqueeze(0).unsqueeze(1)
            probs.append(classifier(inp)["logits"].item())
    return ExonResponse(probabilities=probs)


def encode_sae(
    embeddings: dict[str, torch.Tensor],
    seq_lengths: list[int],
    meta: EmbedBatch,
    sae: BatchTopKTiedSAE,
) -> SaeResponse:
    """Encode each sequence's activations through the SAE.

    Returns sparse feature activations per position. The SAE uses batch top-k
    sparsity, so the total number of non-zero features across all positions is
    k × seq_len; individual positions may have more or fewer than k active
    features.
    """
    emb = embeddings[_EVO2_LAYER]
    all_seqs: list[list[SparseActivation]] = []
    with torch.inference_mode():
        for i in range(meta.n_forward):
            acts = emb[i, : seq_lengths[i], :]
            feats = sae.encode(acts)  # (seq_len, n_features)
            positions: list[SparseActivation] = []
            for pos in range(feats.shape[0]):
                nz = feats[pos].nonzero(as_tuple=True)[0]
                positions.append(
                    SparseActivation(
                        indices=nz.tolist(),
                        values=feats[pos, nz].float().tolist(),
                    )
                )
            all_seqs.append(positions)
    return SaeResponse(features=all_seqs, n_features=sae.d_hidden)
