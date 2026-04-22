import { validateIntentBatchShape } from "./actionShapeValidator.js";

/**
 * @param {import("@genome-spy/app").AgentApi} agentApi
 * @param {unknown} batch
 * @returns {import("./types.js").IntentBatchValidationResult}
 */
export function validateIntentBatch(agentApi, batch) {
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

    const sampleHierarchy = agentApi.getSampleHierarchy();
    if (!sampleHierarchy) {
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

        const attribute =
            /** @type {{ type?: string; specifier?: unknown } | undefined} */ (
                payload?.attribute
            );
        if (
            attribute?.type === "SAMPLE_ATTRIBUTE" &&
            typeof attribute.specifier === "string" &&
            !agentApi.getAttributeInfo(
                /** @type {import("@genome-spy/app").AttributeIdentifier} */ (
                    attribute
                )
            )
        ) {
            errors.push(
                `$.steps[${normalizedSteps.length - 1}].payload.attribute references unknown attribute ${attribute.specifier}.`
            );
        }
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
