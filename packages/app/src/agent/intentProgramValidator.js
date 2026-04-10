import { validateIntentProgramShape } from "./actionShapeValidator.js";

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
    const shapeValidation = validateIntentProgramShape(candidate);
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

    const getAttributeInfo = sampleView
        ? sampleView.compositeAttributeInfoSource.getAttributeInfo.bind(
              sampleView.compositeAttributeInfoSource
          )
        : undefined;

    /** @type {import("./types.js").IntentProgramStep[]} */
    const normalizedSteps = [];

    for (const [index, step] of candidate.steps.entries()) {
        const stepObject = /** @type {Record<string, any>} */ (step);
        const actionType = /** @type {import("./types.js").AgentActionType} */ (
            stepObject.actionType
        );
        const payload = stepObject.payload;

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
        program: {
            schemaVersion: 1,
            rationale:
                typeof candidate.rationale === "string"
                    ? candidate.rationale
                    : undefined,
            steps: normalizedSteps,
        },
    };
}
