"""Reference genome helpers for SNP window extraction."""

from __future__ import annotations

from pyfaidx import Fasta


def normalize_chrom(chrom: str, available: set[str]) -> str:
    """Return the FASTA key for chrom, trying bare and chr-prefixed forms.

    Args:
        chrom: Chromosome name from the mutation table (e.g. "17" or "chr17").
        available: Keys present in the FASTA index.

    Raises:
        KeyError: If neither form is found.
    """
    if chrom in available:
        return chrom
    alt = f"chr{chrom}" if not chrom.startswith("chr") else chrom[3:]
    if alt in available:
        return alt
    raise KeyError(
        f"Chromosome '{chrom}' not found in reference (tried '{chrom}' and '{alt}')"
    )


def extract_snp_windows(
    ref: Fasta,
    chrom_keys: set[str],
    chrom: str,
    pos: int,
    ref_allele: str,
    alt_allele: str,
    window_size: int = 2048,
) -> tuple[str, str]:
    """Extract ref and alt sequences centered on a SNP position.

    Reads only the requested window from disk via the pyfaidx slice API.

    Args:
        ref: Open pyfaidx Fasta handle.
        chrom_keys: Sequence keys in the FASTA (used for chr normalisation).
        chrom: Chromosome of the variant.
        pos: 1-based genomic position.
        ref_allele: Expected reference base at pos.
        alt_allele: Alternate allele to substitute.
        window_size: Width of the sequence window in base pairs.

    Returns:
        Tuple (ref_seq, alt_seq) of equal-length uppercase strings.

    Raises:
        KeyError: If chrom is not found in the reference.
        ValueError: If the reference base in the FASTA does not match ref_allele.
    """
    key = normalize_chrom(chrom, chrom_keys)
    p = pos - 1  # convert to 0-based
    half = window_size // 2
    chrom_len = len(ref[key])
    start = max(0, p - half)
    end = min(chrom_len, p + half)
    ref_seq = ref[key][start:end].seq.upper()

    snv_pos = min(half, p)

    if ref_seq[snv_pos] != ref_allele.upper():
        raise ValueError(
            f"{chrom}:{pos} — genome has '{ref_seq[snv_pos]}', "
            f"expected '{ref_allele.upper()}'"
        )

    alt_seq = ref_seq[:snv_pos] + alt_allele.upper() + ref_seq[snv_pos + 1 :]
    assert len(alt_seq) == len(ref_seq)
    return ref_seq, alt_seq
