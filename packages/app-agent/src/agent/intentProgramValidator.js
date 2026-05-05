import { resolveParamSelector } from "@genome-spy/core/view/viewSelectors.js";
import { validateIntentBatchShape } from "./actionShapeValidator.js";

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
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

    for (const [index, step] of candidate.steps.entries()) {
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
                /** @type {import("@genome-spy/app/agentShared").AttributeIdentifier} */ (
                    attribute
                )
            )
        ) {
            errors.push(
                `$.steps[${normalizedSteps.length - 1}].payload.attribute references unknown attribute ${attribute.specifier}.`
            );
        }

        if (
            actionType === "paramProvenance/paramChange" &&
            payload.value.type === "interval"
        ) {
            const resolved = resolveParamSelector(
                agentApi.getViewRoot(),
                payload.selector
            );
            if (!resolved) {
                errors.push(
                    "$.steps[" +
                        index +
                        "].payload.selector does not resolve to a parameter."
                );
            } else {
                for (const [channel, interval] of Object.entries(
                    payload.value.intervals
                )) {
                    const resolution = resolved.view.getScaleResolution(
                        /** @type {import("@genome-spy/core/spec/channel.js").ChannelWithScale} */ (
                            channel
                        )
                    );
                    if (!interval || resolution?.type !== "locus") {
                        continue;
                    }

                    for (const [itemIndex, item] of interval.entries()) {
                        if (typeof item === "number") {
                            errors.push(
                                "$.steps[" +
                                    index +
                                    "].payload.value.intervals." +
                                    channel +
                                    "[" +
                                    itemIndex +
                                    '] must include a chromosome, for example { "chrom": "chr17", "pos": 39688083 }, when ' +
                                    channel +
                                    " uses a locus scale."
                            );
                        }
                    }
                }
            }
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
