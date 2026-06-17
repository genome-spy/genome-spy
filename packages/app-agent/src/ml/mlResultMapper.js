import { variantKey } from "./mlVariantCollector.js";

/**
 * Maps per-variant AlphaGenome scores to per-sample metadata columns and
 * builds the Redux action payloads that `agentApi.submitIntentActions` can
 * dispatch directly into the sample view.
 *
 * Per-variant reduction: max |value| across all track channels for each head.
 * Per-sample aggregation: max across all variants belonging to that sample in
 * the brushed region.
 *
 * The resulting `sampleView/addMetadata` action takes columnar metadata
 * keyed by `ag_{head}_max` (e.g. `ag_atac_max`, `ag_cage_max`).
 */

/**
 * @param {Map<string, import("./mlVariantCollector.js").MutationRow>} uniqueVariants
 * @param {import("./mlVariantCollector.js").MutationRow[]} allRows
 * @param {{ scores: Array<Record<string, number[]>> }} response
 *   AlphaGenome ScoreResponse: `scores[i]` corresponds to `uniqueVariants[i]`.
 * @param {string[]} heads - The AlphaGenome heads that were scored.
 * @returns {object[]} Redux action objects ready for `agentApi.submitIntentActions`.
 */
export function buildAlphaGenomeMetadataActions(
    uniqueVariants,
    allRows,
    response,
    heads
) {
    const variantKeys = [...uniqueVariants.keys()];
    const scoreColumns = heads.map((h) => `ag_${h}_max`);

    const variantScores = _computeVariantScores(
        variantKeys,
        response.scores,
        heads,
        scoreColumns
    );
    const sampleScores = _aggregateToSamples(
        allRows,
        variantScores,
        scoreColumns
    );

    return [_buildAddMetadataAction(sampleScores, scoreColumns)];
}

/**
 * @param {string[]} variantKeys
 * @param {Array<Record<string, number[]>>} scores
 * @param {string[]} heads
 * @param {string[]} scoreColumns
 * @returns {Map<string, Record<string, number>>}
 */
function _computeVariantScores(variantKeys, scores, heads, scoreColumns) {
    if (scores.length !== variantKeys.length) {
        throw new Error(
            `AlphaGenome response has ${scores.length} score(s) but expected ${variantKeys.length}.`
        );
    }
    const variantScores = new Map();
    for (const [i, key] of variantKeys.entries()) {
        const s = scores[i];
        const entry = /** @type {Record<string, number>} */ ({});
        for (const [j, head] of heads.entries()) {
            const vals = s[head];
            entry[scoreColumns[j]] = vals?.length
                ? Math.max(...vals.map(Math.abs))
                : 0;
        }
        variantScores.set(key, entry);
    }
    return variantScores;
}

/**
 * @param {import("./mlVariantCollector.js").MutationRow[]} allRows
 * @param {Map<string, Record<string, number>>} variantScores
 * @param {string[]} scoreColumns
 * @returns {Map<string, Record<string, number>>}
 */
function _aggregateToSamples(allRows, variantScores, scoreColumns) {
    const sampleScores = new Map();
    for (const row of allRows) {
        const key = variantKey(row);
        const vs = variantScores.get(key);
        if (!vs) {
            throw new Error(`No score found for variant key "${key}".`);
        }

        const existing =
            sampleScores.get(row.Sample) ??
            Object.fromEntries(scoreColumns.map((c) => [c, 0]));

        for (const col of scoreColumns) {
            existing[col] = Math.max(existing[col], vs[col] ?? 0);
        }
        sampleScores.set(row.Sample, existing);
    }
    return sampleScores;
}

/**
 * Maps Evo2 per-variant delta scores to per-sample metadata and builds the
 * Redux action payload.  The single score column is `ev2_delta_max`.
 *
 * Per-variant reduction: |delta| (absolute value of log-likelihood change).
 * Per-sample aggregation: max across all variants in the brushed region.
 *
 * @param {Map<string, import("./mlVariantCollector.js").MutationRow>} uniqueVariants
 * @param {import("./mlVariantCollector.js").MutationRow[]} allRows
 * @param {{ scores: Array<{ delta: number | null }> }} response
 * @returns {object[]} Redux action objects ready for `agentApi.submitIntentActions`.
 */
export function buildEvo2MetadataActions(uniqueVariants, allRows, response) {
    const variantKeys = [...uniqueVariants.keys()];
    const col = "ev2_delta_max";

    const variantScores = new Map();
    for (const [i, key] of variantKeys.entries()) {
        const delta = response.scores[i]?.delta ?? null;
        variantScores.set(key, { [col]: delta != null ? Math.abs(delta) : 0 });
    }

    const sampleScores = _aggregateToSamples(allRows, variantScores, [col]);
    return [_buildAddMetadataAction(sampleScores, [col])];
}

/**
 * Builds the `sampleView/addMetadata` action with columnar metadata.
 * The sample ID column must be named "sample" to match the slice convention.
 *
 * @param {Map<string, Record<string, number>>} sampleScores
 * @param {string[]} scoreColumns
 * @returns {{ type: string; payload: object }}
 */
function _buildAddMetadataAction(sampleScores, scoreColumns) {
    const sampleIds = [...sampleScores.keys()];
    const columnarMetadata =
        /** @type {Record<string, (string | number)[]>} */ ({
            sample: sampleIds,
        });
    for (const col of scoreColumns) {
        columnarMetadata[col] = sampleIds.map(
            (id) => sampleScores.get(id)[col]
        );
    }

    return {
        type: "sampleView/addMetadata",
        payload: { columnarMetadata },
    };
}
