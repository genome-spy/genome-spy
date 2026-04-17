import { validateIntentBatchShape } from "./actionShapeValidator.js";

/**
 * @param {import("../app.js").default} app
 * @param {unknown} batch
 * @returns {import("./types.js").IntentBatchValidationResult}
 */
export function validateIntentBatch(app, batch) {
    /** @type {string[]} */
    const errors = [];

    if (!batch || typeof batch !== "object") {
        return {
            ok: false,
            errors: ["Intent batch must be an object."],
        };
    }

    const candidate = /** @type {Record<string, any>} */ (batch);
    const shapeValidation = validateIntentBatchShape(candidate);
    if (!shapeValidation.ok) {
        return {
            ok: false,
            errors: shapeValidation.errors,
        };
    }

    const sampleView = app.getSampleView();
    if (!sampleView) {
        errors.push("SampleView is not available.");
    }

    /** @type {import("./types.js").IntentBatchStep[]} */
    const normalizedSteps = [];

    for (const [, step] of candidate.steps.entries()) {
        const stepObject = /** @type {Record<string, any>} */ (step);
        const actionType = /** @type {import("./types.js").AgentActionType} */ (
            stepObject.actionType
        );
        const payload = stepObject.payload;

        normalizedSteps.push({
            actionType,
            payload,
        });
    }

    if (errors.length) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        errors: [],
        batch: {
            schemaVersion: 1,
            rationale:
                typeof candidate.rationale === "string"
                    ? candidate.rationale
                    : undefined,
            steps: normalizedSteps,
        },
    };
}
