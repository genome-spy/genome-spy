const BASES = ["A", "C", "G", "T"];

/**
 * Create a stable unsigned hash for one genomic coordinate.
 *
 * @param {string} chrom
 * @param {number} pos
 */
function hashCoordinate(chrom, pos) {
    let hash = 2_166_136_261;

    for (const char of chrom) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16_777_619);
    }

    hash ^= pos;

    // Avalanche the hash so adjacent positions do not expose the repeating
    // low-bit pattern produced by the FNV multiplication alone.
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2_246_822_507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3_266_489_909);
    hash ^= hash >>> 16;

    return hash >>> 0;
}

/**
 * Stand in for an asynchronous data provider such as a notebook or sequence
 * loader. Each base is derived from its chromosome and position, so repeated
 * requests return identical data without a network dependency.
 *
 * @param {string} chrom
 * @param {number} start
 * @param {number} end
 * @returns {Promise<{ chrom: string, start: number, sequence: string }>}
 */
export async function getFakeSequence(chrom, start, end) {
    const length = Math.max(0, end - start);
    const sequence = Array.from({ length }, (_, offset) => {
        const baseIndex = hashCoordinate(chrom, start + offset) % BASES.length;
        return BASES[baseIndex];
    }).join("");

    return { chrom, start, sequence };
}
