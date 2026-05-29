import {
    getActionCatalogEntry,
    summarizeIntentBatch,
} from "./actionCatalog.js";
import { collectVisibleSampleIds } from "./sampleHierarchyScope.js";
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
        ? collectVisibleSampleIds(sampleHierarchy.rootGroup).length
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
    const updatedSampleHierarchy = agentApi.getSampleHierarchy();
    if (!updatedSampleHierarchy) {
        throw new Error("SampleView is not available.");
    }

    const summaries = summarizeIntentBatch(agentApi, validation.batch);
    /** @type {import("./types.js").IntentBatchExecutionContent} */
    const content = {
        kind: "intent_batch_result",
        provenanceIds,
    };
    if (hasSampleViewMutation) {
        const afterVisibleSampleCount = collectVisibleSampleIds(
            updatedSampleHierarchy.rootGroup
        ).length;
        const afterGroupLevelCount =
            updatedSampleHierarchy.groupMetadata?.length ?? 0;
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
