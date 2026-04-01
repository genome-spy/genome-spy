import { getActionCatalogEntry } from "./actionCatalog.js";

/**
 * @param {import("../app.js").default} app
 * @param {unknown} program
 * @returns {import("./types.js").IntentProgramValidationResult}
 */
export function validateIntentProgram(app, program) {
    /** @type {string[]} */
    const errors = [];

    if (!program || typeof program !== "object") {
        return {
            ok: false,
            errors: ["Intent program must be an object."],
        };
    }

    const candidate = /** @type {Record<string, any>} */ (program);
    if (candidate.schemaVersion !== 1) {
        errors.push("schemaVersion must be 1.");
    }

    if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) {
        errors.push("steps must be a non-empty array.");
    }

    const sampleView = app.getSampleView();
    if (!sampleView) {
        errors.push("SampleView is not available.");
    }

    const getAttributeInfo = sampleView
        ? sampleView.compositeAttributeInfoSource.getAttributeInfo.bind(
              sampleView.compositeAttributeInfoSource
          )
        : undefined;

    /** @type {import("./types.js").IntentProgramStep[]} */
    const normalizedSteps = [];

    for (const [index, step] of (candidate.steps ?? []).entries()) {
        if (!step || typeof step !== "object") {
            errors.push("steps[" + index + "] must be an object.");
            continue;
        }

        const stepObject = /** @type {Record<string, any>} */ (step);
        const actionType = stepObject.actionType;
        if (typeof actionType !== "string") {
            errors.push("steps[" + index + "].actionType must be a string.");
            continue;
        }

        const entry = getActionCatalogEntry(
            /** @type {import("./types.js").AgentActionType} */ (actionType)
        );
        if (!entry) {
            errors.push(
                "steps[" +
                    index +
                    "] uses unsupported actionType " +
                    actionType +
                    "."
            );
            continue;
        }

        const payload =
            stepObject.payload && typeof stepObject.payload === "object"
                ? stepObject.payload
                : undefined;
        if (!payload) {
            errors.push("steps[" + index + "].payload must be an object.");
            continue;
        }

        for (const error of entry.validatePayload(payload)) {
            errors.push("steps[" + index + "]: " + error);
        }

        if ("attribute" in payload && getAttributeInfo) {
            try {
                getAttributeInfo(payload.attribute);
            } catch {
                errors.push(
                    "steps[" +
                        index +
                        "]: unknown attribute " +
                        JSON.stringify(payload.attribute) +
                        "."
                );
            }
        }

        normalizedSteps.push({
            actionType: /** @type {import("./types.js").AgentActionType} */ (
                actionType
            ),
            payload,
        });
    }

    if (errors.length) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        errors: [],
        program: {
            schemaVersion: 1,
            rationale:
                typeof candidate.rationale === "string"
                    ? candidate.rationale
                    : undefined,
            needsConfirmation:
                typeof candidate.needsConfirmation === "boolean"
                    ? candidate.needsConfirmation
                    : normalizedSteps.length > 1,
            steps: normalizedSteps,
        },
    };
}
