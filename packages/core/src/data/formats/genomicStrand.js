/**
 * @typedef {"+" | "-" | null} GenomicStrand
 */

/**
 * Normalizes parser-native strand values at a known genomic format boundary.
 *
 * @param {string | number | null | undefined} strand
 * @returns {GenomicStrand}
 */
export function normalizeGenomicStrand(strand) {
    if (strand === "+" || strand === 1) {
        return "+";
    } else if (strand === "-" || strand === -1) {
        return "-";
    } else if (
        strand === "." ||
        strand === 0 ||
        strand === null ||
        strand === undefined
    ) {
        return null;
    } else {
        throw new Error(`Unexpected genomic strand: ${JSON.stringify(strand)}`);
    }
}
