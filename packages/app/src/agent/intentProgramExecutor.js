import {
    getActionCatalogEntry,
    summarizeIntentBatch,
} from "./actionCatalog.js";
import { validateIntentBatch } from "./intentProgramValidator.js";

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").IntentBatch} batch
 * @param {{submissionKind?: "agent" | "bookmark" | "user"}} [options]
 * @returns {Promise<import("./types.js").IntentBatchExecutionResult>}
 */
export async function submitIntentActions(app, batch, options = {}) {
    const validation = validateIntentBatch(app, batch);
    if (!validation.ok) {
        throw new Error(validation.errors.join("\n"));
    }

    const sampleView = app.getSampleView();
    if (!sampleView) {
        throw new Error("SampleView is not available.");
    }

    const getAttributeInfo =
        sampleView.compositeAttributeInfoSource.getAttributeInfo.bind(
            sampleView.compositeAttributeInfoSource
        );
    const provenanceStartIndex = app.provenance.getActionHistory().length;
    const actions = validation.batch.steps.map((step) =>
        getActionCatalogEntry(step.actionType).actionCreator(step.payload)
    );

    const hasSampleViewMutation = validation.batch.steps.some((step) =>
        step.actionType.startsWith("sampleView/")
    );
    const beforeVisibleSampleCount = hasSampleViewMutation
        ? countVisibleSamples(sampleView.sampleHierarchy.rootGroup)
        : undefined;
    const beforeGroupLevelCount = hasSampleViewMutation
        ? (sampleView.sampleHierarchy.groupMetadata?.length ?? 0)
        : undefined;

    await app.intentPipeline.submit(actions, {
        getAttributeInfo,
        submissionKind: options.submissionKind ?? "agent",
    });
    const provenanceIds = getDispatchedProvenanceIds(app, provenanceStartIndex);

    const summaries = summarizeIntentBatch(app, validation.batch);
    /** @type {import("./types.js").IntentBatchExecutionContent} */
    const content = {
        kind: "intent_batch_result",
        batch: validation.batch,
        provenanceIds,
    };
    if (hasSampleViewMutation) {
        const afterVisibleSampleCount = countVisibleSamples(
            sampleView.sampleHierarchy.rootGroup
        );
        const afterGroupLevelCount =
            sampleView.sampleHierarchy.groupMetadata?.length ?? 0;
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
 * @param {import("../sampleView/state/sampleState.js").Group} group
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
 * @param {import("../app.js").default} app
 * @param {number} provenanceStartIndex
 * @returns {string[]}
 */
function getDispatchedProvenanceIds(app, provenanceStartIndex) {
    return app.provenance
        .getActionHistory()
        .slice(provenanceStartIndex)
        .map((action) => action.provenanceId)
        .filter((provenanceId) => typeof provenanceId === "string");
}
