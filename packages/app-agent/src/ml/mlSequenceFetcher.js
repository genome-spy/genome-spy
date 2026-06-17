/**
 * Fetches a 131 072 bp reference window centered on the variant cluster
 * midpoint using an indexed FASTA file (same mechanism as GenomeSpy core's
 * IndexedFastaSource).  No separate sequence server is required — the .fa and
 * .fai are served as static files by the Vite dev server.
 *
 * The caller provides a `fastaUrl` such as
 *   "/private/website-examples/TCGA_BRCA/hg19.fa"
 * The .fai index is assumed to live at `fastaUrl + ".fai"`.
 */

/** AlphaGenome requires exactly 131 072 bp of context. */
const ALPHAGENOME_WINDOW = 131_072;
const ALPHAGENOME_HALF = ALPHAGENOME_WINDOW / 2;

/**
 * @typedef {{
 *   seq: string;
 *   windowStart: number;
 *   windowEnd: number;
 *   chromosome: string;
 * }} ReferenceWindow
 */

/** @type {Map<string, object>} */
const _fastaCache = new Map();

/**
 * Returns a cached IndexedFasta instance for the given URL, constructing one
 * on first access.  The .fai is fetched lazily by IndexedFasta on first
 * getSequence call and cached inside the instance; re-using the same instance
 * across calls avoids re-fetching the index on every scoring run.
 *
 * @param {string} fastaUrl
 * @returns {Promise<any>}
 */
async function _getFasta(fastaUrl) {
    if (!_fastaCache.has(fastaUrl)) {
        const [{ IndexedFasta }, { RemoteFile }] = await Promise.all([
            import("@gmod/indexedfasta"),
            import("generic-filehandle2"),
        ]);
        _fastaCache.set(
            fastaUrl,
            new IndexedFasta({
                fasta: /** @type {any} */ (new RemoteFile(fastaUrl)),
                fai: /** @type {any} */ (new RemoteFile(fastaUrl + ".fai")),
            })
        );
    }
    return _fastaCache.get(fastaUrl);
}

/**
 * Fetches a 131 K reference window centered on the midpoint of the provided
 * variant positions via HTTP byte-range requests against the indexed FASTA.
 *
 * @param {string} fastaUrl
 *   Absolute or root-relative URL to the .fa file.  The .fai is assumed at
 *   `fastaUrl + ".fai"`.
 * @param {import("./mlVariantCollector.js").MutationRow[]} variantRows
 *   At least one row.  All rows must be on the same chromosome.
 * @param {AbortSignal} [signal]
 * @returns {Promise<ReferenceWindow>}
 */
export async function fetchReferenceWindow(fastaUrl, variantRows, signal) {
    if (variantRows.length === 0) {
        throw new Error("Cannot fetch reference window: no variants provided.");
    }

    const fasta = await _getFasta(fastaUrl);

    const positions = variantRows.map((r) => r.Start_Position);
    const center1based = Math.round(
        (Math.min(...positions) + Math.max(...positions)) / 2
    );

    // indexedfasta uses 0-based half-open coordinates.
    const start0 = center1based - 1 - ALPHAGENOME_HALF;
    const end0 = center1based - 1 + ALPHAGENOME_HALF;
    const chromosome = "chr" + variantRows[0].Chromosome;

    const seq = await fasta.getSequence(chromosome, start0, end0, { signal });

    if (!seq || seq.length !== ALPHAGENOME_WINDOW) {
        throw new Error(
            `Expected ${ALPHAGENOME_WINDOW} bp from indexed FASTA, got ${seq?.length ?? 0}.`
        );
    }

    // windowStart is 1-based so that offset = Start_Position - windowStart is correct.
    return {
        seq: seq.toUpperCase(),
        windowStart: start0 + 1,
        windowEnd: end0 + 1,
        chromosome,
    };
}
