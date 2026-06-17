from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

_VALID_HEADS = frozenset([
    "atac", "dnase", "procap", "cage", "rna_seq", "chip_tf", "chip_histone",
    "contact_maps", "splice_sites", "splice_site_usage", "splice_junctions",
])

_SEQ_LENGTH = 131_072


def _validate_seq(v: str) -> str:
    """Normalise and validate a DNA sequence string."""
    if len(v) != _SEQ_LENGTH:
        raise ValueError(f"seq must be exactly {_SEQ_LENGTH} bp, got {len(v)}")
    return v.upper()


def _validate_heads(v: list[str]) -> list[str]:
    """Reject any head name not produced by AlphaGenome."""
    bad = [h for h in v if h not in _VALID_HEADS]
    if bad:
        raise ValueError(f"Unknown heads: {bad}. Valid: {sorted(_VALID_HEADS)}")
    return v


class PredictRequest(BaseModel):
    task: Literal["predict"] = "predict"
    seq: str
    organism: Literal["human", "mouse"] = "human"
    heads: list[str] = ["atac", "dnase", "cage"]
    resolution: Literal[1, 128] = 128

    _check_seq = field_validator("seq", mode="before")(_validate_seq)
    _check_heads = field_validator("heads")(_validate_heads)


class PredictResponse(BaseModel):
    """Track predictions for one or more sequences.

    ``tracks[head][seq_idx]`` is a ``(positions, n_tracks)`` matrix.
    """

    tracks: dict[str, list[list[list[float]]]]


class SeqPair(BaseModel):
    ref: str
    alt: str

    _check_ref = field_validator("ref", mode="before")(_validate_seq)
    _check_alt = field_validator("alt", mode="before")(_validate_seq)


class SNV(BaseModel):
    """A single-nucleotide substitution described as an offset into a reference window.

    Used with ``ScoreRequest``'s ``seq + snvs`` input mode so the browser can send
    one 131 K reference window plus a list of variant descriptors, rather than
    ``N × 131 K`` full sequence pairs.  The server builds each ref/alt pair by
    substituting ``alt_base`` at ``seq[offset]``.
    """

    offset: int    # 0-based position within the provided ``seq``
    ref_base: str  # base expected at ``seq[offset]``; validated against the sequence
    alt_base: str  # the alternate base to substitute


class ScoreRequest(BaseModel):
    task: Literal["score"] = "score"
    # Mode 1: client sends full 131 K ref/alt sequence pairs.
    pairs: list[SeqPair] | None = None
    # Mode 2: client sends one reference window plus SNV descriptors.
    # The server builds each ref/alt pair internally (ref runs only once).
    seq: str | None = None
    snvs: list[SNV] | None = None
    organism: Literal["human", "mouse"] = "human"
    heads: list[str] = ["atac", "dnase", "cage"]
    resolution: Literal[1, 128] = 128
    # Variant should be placed at the center of the 131K window (position 65536).
    window_size: int = 501
    # "splice" uses the weighted splice-head formula from the AlphaGenome paper
    # and ignores the heads field (splice_sites/usage/junctions are always used).
    scorer: Literal["window", "splice"] = "window"

    _check_heads = field_validator("heads")(_validate_heads)

    @model_validator(mode="after")
    def _check_input_mode(self) -> "ScoreRequest":
        has_pairs = self.pairs is not None
        has_seq = self.seq is not None
        if has_pairs and has_seq:
            raise ValueError(
                "Provide either 'pairs' (full sequences) or 'seq' + 'snvs', not both."
            )
        if not has_pairs and not has_seq:
            raise ValueError(
                "Provide either 'pairs' (full sequences) or 'seq' + 'snvs' "
                "(one reference window plus substitution descriptors)."
            )
        if has_seq:
            seq = self.seq.upper()
            if len(seq) != _SEQ_LENGTH:
                raise ValueError(f"seq must be exactly {_SEQ_LENGTH} bp, got {len(seq)}")
            if not self.snvs:
                raise ValueError("'snvs' must be non-empty when 'seq' is provided.")
            for i, snv in enumerate(self.snvs):
                if not (0 <= snv.offset < _SEQ_LENGTH):
                    raise ValueError(
                        f"snvs[{i}].offset {snv.offset} is out of range [0, {_SEQ_LENGTH})"
                    )
                if seq[snv.offset] != snv.ref_base.upper():
                    raise ValueError(
                        f"snvs[{i}]: seq[{snv.offset}]='{seq[snv.offset]}' "
                        f"does not match ref_base='{snv.ref_base.upper()}'"
                    )
        return self


class ScoreResponse(BaseModel):
    """Per-track alt − ref scores for one or more variant pairs.

    ``scores[pair_idx][head]`` is a list of floats, one per output track channel.
    """

    scores: list[dict[str, list[float]]]


class EmbedRequest(BaseModel):
    task: Literal["embed"] = "embed"
    seq: str
    organism: Literal["human", "mouse"] = "human"

    _check_seq = field_validator("seq", mode="before")(_validate_seq)


class EmbedResponse(BaseModel):
    """128 bp trunk embeddings for a single sequence.

    ``embeddings_128bp`` has shape ``(1024, 3072)``.
    """

    embeddings_128bp: list[list[float]]


class ISMRequest(BaseModel):
    """Request for in-silico mutagenesis over a sub-window of a 131K sequence.

    Generates all single-nucleotide substitutions within ``[ism_start, ism_end)``
    and scores each against the reference using a center window.  The variant at
    each ISM position is centered in the scoring window; for best results keep the
    ISM window near position 65 536 (the center of the 131K context).
    """

    task: Literal["ism"] = "ism"
    seq: str
    organism: Literal["human", "mouse"] = "human"
    heads: list[str] = ["atac", "dnase", "cage"]
    resolution: Literal[1, 128] = 128
    window_size: int = 501
    ism_start: int
    ism_end: int

    _check_seq = field_validator("seq", mode="before")(_validate_seq)
    _check_heads = field_validator("heads")(_validate_heads)

    @model_validator(mode="after")
    def _check_ism_window(self) -> "ISMRequest":
        if not (0 <= self.ism_start < self.ism_end <= _SEQ_LENGTH):
            raise ValueError(
                f"ism_start/ism_end must satisfy 0 <= ism_start < ism_end <= {_SEQ_LENGTH}, "
                f"got [{self.ism_start}, {self.ism_end})"
            )
        return self


class ISMResponse(BaseModel):
    """Per-position, per-base, per-track alt − ref scores.

    ``ism_matrix[head]`` has shape ``(positions, 4, n_tracks)``.
    Base axis order: ``ACGT``.  The reference base at each position is always 0.
    """

    ism_matrix: dict[str, list[list[list[float]]]]
