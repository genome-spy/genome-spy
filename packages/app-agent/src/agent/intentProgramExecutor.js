import {
    getActionCatalogEntry,
    summarizeIntentBatch,
} from "./actionCatalog.js";
import { validateIntentBatch } from "./intentProgramValidator.js";

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {import("./types.js").IntentBatch} batch
 * @param {{submissionKind?: "agent" | "bookmark" | "user"}} [options]
 * @returns {Promise<import("./types.js").IntentBatchExecutionResult>}
 */
export async function submitIntentActions(agentApi, batch, options = {}) {
    const validation = validateIntentBatch(agentApi, batch);
    if (!validation.ok) {
        throw new Error(validation.errors.join("\n"));
    }

    const sampleHierarchy = agentApi.getSampleHierarchy();
    if (!sampleHierarchy) {
        throw new Error("SampleView is not available.");
    }

    const provenanceStartIndex = agentApi.getActionHistory().length;
    const actions = validation.batch.steps.map((step) =>
        getActionCatalogEntry(step.actionType).actionCreator(step.payload)
    );

    const hasSampleViewMutation = validation.batch.steps.some((step) =>
        step.actionType.startsWith("sampleView/")
    );
    const beforeVisibleSampleCount = hasSampleViewMutation
        ? countVisibleSamples(sampleHierarchy.rootGroup)
        : undefined;
    const beforeGroupLevelCount = hasSampleViewMutation
        ? (sampleHierarchy.groupMetadata?.length ?? 0)
        : undefined;

    await agentApi.submitIntentActions(actions, {
        submissionKind: options.submissionKind ?? "agent",
    });
    const provenanceIds = getDispatchedProvenanceIds(
        agentApi,
        provenanceStartIndex
    );

    const summaries = summarizeIntentBatch(agentApi, validation.batch);
    /** @type {import("./types.js").IntentBatchExecutionContent} */
    const content = {
        kind: "intent_batch_result",
        batch: validation.batch,
        provenanceIds,
    };
    if (hasSampleViewMutation) {
        const afterVisibleSampleCount = countVisibleSamples(
            sampleHierarchy.rootGroup
        );
        const afterGroupLevelCount = sampleHierarchy.groupMetadata?.length ?? 0;
        content.sampleView = {
            visibleSamplesBefore: beforeVisibleSampleCount,
            visibleSamplesAfter: afterVisibleSampleCount,
            groupLevelsBefore: beforeGroupLevelCount,
            groupLevelsAfter: afterGroupLevelCount,
        };
        summaries.push({
            content: "Visible samples before: " + beforeVisibleSampleCount,
            text: "Visible samples before: " + beforeVisibleSampleCount,
        });
        summaries.push({
            content: "Visible samples after: " + afterVisibleSampleCount,
            text: "Visible samples after: " + afterVisibleSampleCount,
        });
        summaries.push({
            content: "Group levels before: " + beforeGroupLevelCount,
            text: "Group levels before: " + beforeGroupLevelCount,
        });
        summaries.push({
            content: "Group levels after: " + afterGroupLevelCount,
            text: "Group levels after: " + afterGroupLevelCount,
        });
    }

    return {
        ok: true,
        executedActions: actions.length,
        content,
        summaries,
        batch: validation.batch,
    };
}

/**
 * @param {import("./types.js").IntentBatchExecutionResult} result
 * @returns {string}
 */
export function summarizeExecutionResult(result) {
    const lines = [
        "Executed " +
            result.executedActions +
            " action" +
            (result.executedActions === 1 ? "" : "s") +
            ".",
    ];

    for (const summary of result.summaries) {
        lines.push("- " + summary.text);
    }

    return lines.join("\n");
}

/**
 * Counts the distinct samples currently present in the visible hierarchy.
 *
 * @param {import("@genome-spy/app/agentShared").Group} group
 * @param {Set<string>} [sampleIds]
 * @returns {number}
 */
function countVisibleSamples(group, sampleIds = new Set()) {
    if ("samples" in group) {
        for (const sampleId of group.samples) {
            sampleIds.add(sampleId);
        }
        return sampleIds.size;
    }

    for (const child of group.groups) {
        countVisibleSamples(child, sampleIds);
    }

    return sampleIds.size;
}

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {number} provenanceStartIndex
 * @returns {string[]}
 */
function getDispatchedProvenanceIds(agentApi, provenanceStartIndex) {
    return agentApi
        .getActionHistory()
        .slice(provenanceStartIndex)
        .map((action) => action.provenanceId)
        .filter((provenanceId) => typeof provenanceId === "string");
}
