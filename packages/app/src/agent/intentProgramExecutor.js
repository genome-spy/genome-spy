import {
    getActionCatalogEntry,
    summarizeIntentProgram,
} from "./actionCatalog.js";
import { validateIntentProgram } from "./intentProgramValidator.js";

/**
 * @param {import("../app.js").default} app
 * @param {import("./types.js").IntentProgram} program
 * @returns {Promise<import("./types.js").IntentProgramExecutionResult>}
 */
export async function submitIntentProgram(app, program) {
    const validation = validateIntentProgram(app, program);
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

    const actions = validation.program.steps.map((step) =>
        getActionCatalogEntry(step.actionType).actionCreator(step.payload)
    );

    const hasSampleViewMutation = validation.program.steps.some((step) =>
        step.actionType.startsWith("sampleView/")
    );
    const beforeVisibleSampleCount = hasSampleViewMutation
        ? countVisibleSamples(sampleView.sampleHierarchy.rootGroup)
        : undefined;

    await app.intentPipeline.submit(actions, { getAttributeInfo });
    const provenanceIds = getDispatchedProvenanceIds(app, provenanceStartIndex);

    const summaries = summarizeIntentProgram(app, validation.program);
    /** @type {import("./types.js").IntentProgramExecutionContent} */
    const content = {
        kind: "intent_program_result",
        program: validation.program,
        provenanceIds,
    };
    if (hasSampleViewMutation) {
        const afterVisibleSampleCount = countVisibleSamples(
            sampleView.sampleHierarchy.rootGroup
        );
        content.sampleView = {
            visibleSamplesBefore: beforeVisibleSampleCount,
            visibleSamplesAfter: afterVisibleSampleCount,
        };
        summaries.push({
            content: "Visible samples before: " + beforeVisibleSampleCount,
            text: "Visible samples before: " + beforeVisibleSampleCount,
        });
        summaries.push({
            content: "Visible samples after: " + afterVisibleSampleCount,
            text: "Visible samples after: " + afterVisibleSampleCount,
        });
    }

    return {
        ok: true,
        executedActions: actions.length,
        content,
        summaries,
        program: validation.program,
    };
}

/**
 * @param {import("./types.js").IntentProgramExecutionResult} result
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
