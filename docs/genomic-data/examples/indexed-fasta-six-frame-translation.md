# Indexed FASTA Six-Frame Translation

This example translates the visible reference sequence in all three reading
frames on both strands. A reference sequence track sits above the translation
tracks; both views share the same lazy indexed-FASTA source.

EXAMPLE examples/docs/genomic-data/examples/indexed-fasta-six-frame-translation.json height=220 spechidden

The translation branch expands the loaded sequence into bases, looks up each
nucleotide complement, and uses `window` `lead` operations to form complete
three-base codons. It then looks up amino acids in the standard genetic code.
The final two bases in a loaded chunk have no complete codon and are filtered
out.

Each lane derives from the absolute genomic position modulo three. This keeps
the reading-frame assignment stable while panning reloads different FASTA
chunks. Reverse-strand codons use a complement lookup followed by the generic
`reverse` expression helper; no sequence-specific reverse-complement operation
is required.

Start codons are green and stop codons are red. The amino-acid blocks use the
`arrow-block-notch` style with inside arrowheads so adjacent codons in a frame
do not overlap.
