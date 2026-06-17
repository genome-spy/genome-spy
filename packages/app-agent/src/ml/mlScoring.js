/**
 * Core AlphaGenome and Evo2 scoring flows, shared by the dialog and the agent
 * tool so neither duplicates the fetch → score → dispatch pipeline.
 *
 * An optional `onProgress` callback lets callers (e.g. the dialog) update UI
 * state at key steps without the flow needing to know about Lit or Redux.
 * `submissionKind` distinguishes user-initiated dispatches from agent-initiated
 * ones so the sample view can record the provenance correctly.
 */

import { fetchReferenceWindow } from "./mlSequenceFetcher.js";
import { scoreWithAlphaGenome, scoreWithEvo2 } from "./mlApiClient.js";
import {
    buildAlphaGenomeMetadataActions,
    buildEvo2MetadataActions,
} from "./mlResultMapper.js";

/**
 * @typedef {{
 *   signal?: AbortSignal;
 *   onProgress?: (message: string) => void;
 *   submissionKind?: "user" | "agent";
 * }} FlowOptions
 */

/**
 * Builds the SNV offset list for AlphaGenome's seq+snvs mode.
 * Internal to this module — callers work with VariantCollection, not raw offsets.
 *
 * @param {Map<string, import("./mlVariantCollector.js").MutationRow>} uniqueVariants
 * @param {number} windowStart - 1-based start of the 131 K reference window.
 * @returns {{ offset: number; ref_base: string; alt_base: string }[]}
 */
function _buildSnvList(uniqueVariants, windowStart) {
    return [...uniqueVariants.values()].map((v) => ({
        offset: v.Start_Position - windowStart,
        ref_base: v.Reference_Allele,
        alt_base: v.Tumor_Seq_Allele2,
    }));
}

/**
 * Run the full AlphaGenome scoring pipeline for a variant collection:
 * fetch reference window → score all SNVs in one request → dispatch metadata.
 *
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {{ baseUrl: string; fastaUrl: string }} config
 * @param {import("./mlVariantCollector.js").VariantCollection} collection
 * @param {string[]} heads - AlphaGenome output heads to score (e.g. ["atac", "cage"]).
 * @param {FlowOptions} [options]
 * @returns {Promise<{ n: number; colNames: string[] }>}
 */
export async function runAlphaGenomeFlow(
    agentApi,
    config,
    collection,
    heads,
    options = {}
) {
    const { signal, onProgress, submissionKind = "user" } = options;
    const { uniqueVariants, allRows } = collection;

    onProgress?.("Fetching reference sequence…");
    const refWindow = await fetchReferenceWindow(
        config.fastaUrl,
        allRows,
        signal
    );

    const n = uniqueVariants.size;
    onProgress?.(`Scoring ${n} variant${n !== 1 ? "s" : ""} with AlphaGenome…`);

    const snvs = _buildSnvList(uniqueVariants, refWindow.windowStart);
    const payload = {
        task: "score",
        seq: refWindow.seq,
        snvs,
        heads,
        organism: "human",
    };
    const response = await scoreWithAlphaGenome(
        config.baseUrl,
        payload,
        signal
    );
    const actions = buildAlphaGenomeMetadataActions(
        uniqueVariants,
        allRows,
        response,
        heads
    );
    await agentApi.submitIntentActions(/** @type {any} */ (actions), {
        submissionKind,
    });

    return { n, colNames: heads.map((h) => `ag_${h}_max`) };
}

/**
 * Run the full Evo2 scoring pipeline for a variant collection:
 * send variant coordinates → score → dispatch metadata.
 *
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {{ baseUrl: string; fastaUrl: string }} config
 * @param {import("./mlVariantCollector.js").VariantCollection} collection
 * @param {FlowOptions} [options]
 * @returns {Promise<{ n: number }>}
 */
export async function runEvo2Flow(agentApi, config, collection, options = {}) {
    const { signal, onProgress, submissionKind = "user" } = options;
    const { uniqueVariants, allRows } = collection;

    const n = uniqueVariants.size;
    onProgress?.(`Scoring ${n} variant${n !== 1 ? "s" : ""} with Evo2…`);

    const variants = [...uniqueVariants.values()].map((v) => ({
        chrom: "chr" + v.Chromosome,
        pos: v.Start_Position,
        ref: v.Reference_Allele,
        alt: v.Tumor_Seq_Allele2,
    }));
    const response = await scoreWithEvo2(config.baseUrl, { variants }, signal);
    const actions = buildEvo2MetadataActions(uniqueVariants, allRows, response);
    await agentApi.submitIntentActions(/** @type {any} */ (actions), {
        submissionKind,
    });

    return { n };
}
