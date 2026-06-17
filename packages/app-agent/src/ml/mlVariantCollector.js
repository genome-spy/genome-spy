/**
 * Collects unique SNVs from the active brush selection across all samples.
 *
 * Reads the brush param directly from the `genomic-data` view and walks the
 * `mutations` view's collector facet batches, which are keyed by sample.  Only
 * rows with `Variant_Type === "SNP"` are included; indels and CNV rows are
 * skipped because the ML models operate on single-base substitutions.
 */

/**
 * @typedef {{
 *   Chromosome: string;
 *   Start_Position: number;
 *   Reference_Allele: string;
 *   Tumor_Seq_Allele2: string;
 *   Sample: string;
 *   Variant_Type: string;
 *   [key: string]: unknown;
 * }} MutationRow
 */

/**
 * @typedef {{
 *   brushInterval: [number, number];
 *   uniqueVariants: Map<string, MutationRow>;
 *   allRows: MutationRow[];
 * }} VariantCollection
 */

/**
 * Returns null when there is no active brush or no SNVs in the brushed region.
 *
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @returns {VariantCollection | null}
 */
export function collectBrushVariants(agentApi) {
    const brushInterval = _readBrushInterval(agentApi);
    if (!brushInterval) return null;

    const { rows, xAccessor } = _readMutationRows(agentApi);
    if (!rows || !xAccessor) return null;

    const [start, end] = brushInterval;

    const allRows = /** @type {MutationRow[]} */ ([]);
    for (const datum of rows) {
        if (datum["Variant_Type"] !== "SNP") continue;
        const x = /** @type {number} */ (xAccessor(datum));
        if (x >= start && x <= end) {
            allRows.push(/** @type {MutationRow} */ (datum));
        }
    }

    if (allRows.length === 0) return null;

    const uniqueVariants = _deduplicateByPosition(allRows);

    return { brushInterval, uniqueVariants, allRows };
}

/**
 * Returns the brush interval [start, end] in continuous (linear) genomic
 * coordinates, or null when no brush is active.
 *
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @returns {[number, number] | null}
 */
function _readBrushInterval(agentApi) {
    const view = agentApi.resolveViewSelector({
        scope: [],
        view: "genomic-data",
    });
    if (!view) return null;

    const brushValue = /** @type {any} */ (
        view.paramRuntime?.getValue("brush")
    );
    const xs = brushValue?.intervals?.x;
    if (!Array.isArray(xs) || xs.length !== 2) return null;
    if (xs[0] === xs[1]) return null;

    return /** @type {[number, number]} */ (xs);
}

/**
 * Returns all datum rows from the mutations view collector together with the
 * x-axis data accessor.
 *
 * The collector's `facetBatches` map groups rows by sample; we flatten all
 * batches to collect mutations across every sample simultaneously.
 *
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @returns {{ rows: Iterable<Record<string, unknown>>; xAccessor: Function } | { rows: null; xAccessor: null }}
 */
function _readMutationRows(agentApi) {
    const view = /** @type {any} */ (
        agentApi.resolveViewSelector({ scope: [], view: "mutations" })
    );
    if (!view) return { rows: null, xAccessor: null };

    const collector = view.getCollector?.();
    const xAccessor = view.getDataAccessor?.("x");
    if (!collector || !xAccessor) return { rows: null, xAccessor: null };

    const allData = /** @type {Record<string, unknown>[]} */ ([]);
    for (const batch of collector.facetBatches.values()) {
        for (const datum of batch) {
            allData.push(datum);
        }
    }

    return { rows: allData, xAccessor };
}

/**
 * Returns the canonical deduplication key for a mutation row.
 * Used by both the collector (to build the map) and the result mapper (to look
 * up scores for rows in allRows).  Single source of truth for the key format.
 *
 * @param {MutationRow} row
 * @returns {string}
 */
export function variantKey(row) {
    return `${row.Chromosome}:${row.Start_Position}:${row.Reference_Allele}:${row.Tumor_Seq_Allele2}`;
}

/**
 * Deduplicates rows by (Chromosome, Start_Position, Reference_Allele,
 * Tumor_Seq_Allele2).  The first occurrence wins.
 *
 * @param {MutationRow[]} rows
 * @returns {Map<string, MutationRow>}
 */
function _deduplicateByPosition(rows) {
    const uniqueVariants = new Map();
    for (const row of rows) {
        const key = variantKey(row);
        if (!uniqueVariants.has(key)) {
            uniqueVariants.set(key, row);
        }
    }
    return uniqueVariants;
}
