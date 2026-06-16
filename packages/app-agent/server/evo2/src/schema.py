from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, model_validator


class SeqPair(BaseModel):
    ref: str
    alt: str


class VariantCoord(BaseModel):
    """Genomic coordinate of a SNP; server extracts the sequence window."""

    chrom: str
    pos: int  # 1-based
    ref: str  # verified against the server genome
    alt: str


class ScoreRequest(BaseModel):
    # Exactly one of the two input modes must be provided.
    pairs: list[SeqPair] | None = None  # sequences supplied by client
    variants: list[VariantCoord] | None = None  # coordinates; server extracts sequences
    window_size: int = 2048  # coordinate mode only
    reduce: Literal["mean", "sum"] = "mean"
    rc_averaging: bool = False
    include_entropy: bool = False

    @model_validator(mode="after")
    def _require_one_mode(self) -> ScoreRequest:
        if self.pairs is None and self.variants is None:
            raise ValueError(
                "Provide either 'pairs' (sequences) or 'variants' (coordinates)."
            )
        if self.pairs is not None and self.variants is not None:
            raise ValueError("Provide 'pairs' or 'variants', not both.")
        return self


class PairScore(BaseModel):
    delta: float | None  # None if coordinate lookup failed
    ref_score: float | None
    alt_score: float | None
    ref_entropy: list[float] | None = None  # per-position; only if include_entropy
    alt_entropy: list[float] | None = None


class ScoreResponse(BaseModel):
    scores: list[PairScore]


class EmbedRequest(BaseModel):
    seqs: list[str]
    layer_names: list[str]


class EmbedResponse(BaseModel):
    # embeddings[layer][seq_idx] is a (seq_len, hidden_dim) matrix as nested lists
    embeddings: dict[str, list[list[list[float]]]]


class ExonRequest(BaseModel):
    seqs: list[str]


class ExonResponse(BaseModel):
    probabilities: list[float]


class SaeRequest(BaseModel):
    seqs: list[str]


class SparseActivation(BaseModel):
    indices: list[int]
    values: list[float]


class SaeResponse(BaseModel):
    features: list[list[SparseActivation]]  # [n_seqs][seq_len]
    n_features: int
