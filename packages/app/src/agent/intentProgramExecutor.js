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

    const actions = validation.program.steps.map((step) =>
        getActionCatalogEntry(step.actionType).actionCreator(step.payload)
    );

    await app.intentPipeline.submit(actions, { getAttributeInfo });

    return {
        ok: true,
        executedActions: actions.length,
        summaries: summarizeIntentProgram(app, validation.program),
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
        lines.push("- " + summary);
    }

    return lines.join("\n");
}
