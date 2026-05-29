import { resolveParamSelector } from "@genome-spy/core/view/viewSelectors.js";
import {
    asSelectionConfig,
    isIntervalSelectionConfig,
    isPointSelectionConfig,
} from "@genome-spy/core/selection/selection.js";
import { getActionCatalogEntry } from "./actionCatalog.js";
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
        const entry = getActionCatalogEntry(actionType);

        normalizedSteps.push({
            actionType,
            payload,
        });

        const attribute =
            /** @type {{ type?: string; specifier?: unknown } | undefined} */ (
                payload?.attribute
            );
        const attributeInfo = attribute?.type
            ? agentApi.getAttributeInfo(
                  /** @type {import("@genome-spy/app/agentShared").AttributeIdentifier} */ (
                      attribute
                  )
              )
            : undefined;
        if (attribute?.type === "SAMPLE_ATTRIBUTE" && !attributeInfo) {
            errors.push(
                "$.steps[" +
                    index +
                    "].payload.attribute references unknown attribute " +
                    attribute.specifier +
                    "."
            );
        }

        const attributeKinds = entry.attributeKinds;
        if (attributeInfo && attributeKinds) {
            if (!attributeKinds.includes(attributeInfo.type)) {
                errors.push(
                    "$.steps[" +
                        index +
                        "].payload.attribute: " +
                        actionType +
                        " requires " +
                        formatOrList(attributeKinds) +
                        ' attributes, but "' +
                        formatAttributeName(attribute) +
                        '" has type ' +
                        attributeInfo.type +
                        "."
                );
            }
        }

        if (actionType === "paramProvenance/paramChange") {
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
                const expectedTypes = getParamValueTypes(resolved.param);
                if (!expectedTypes.includes(payload.value.type)) {
                    errors.push(
                        "$.steps[" +
                            index +
                            "].payload.value.type must be " +
                            formatOrList(expectedTypes, quoteString) +
                            ' for parameter "' +
                            payload.selector.param +
                            '", but got "' +
                            payload.value.type +
                            '".'
                    );
                }

                if (payload.value.type !== "interval") {
                    continue;
                }

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

/**
 * @param {import("@genome-spy/core/spec/parameter.js").Parameter} param
 * @returns {string[]}
 */
function getParamValueTypes(param) {
    if ("select" in param) {
        const select = asSelectionConfig(param.select);
        if (isIntervalSelectionConfig(select)) {
            return ["interval"];
        }
        if (isPointSelectionConfig(select)) {
            return ["point", "pointExpand"];
        }
    }

    return ["value"];
}

/**
 * @param {string} value
 */
function quoteString(value) {
    return '"' + value + '"';
}

/**
 * @param {string[]} values
 * @param {(value: string) => string} [formatter]
 */
function formatOrList(values, formatter = (value) => value) {
    if (values.length === 1) {
        return formatter(values[0]);
    }

    const formatted = values.map(formatter);
    return formatted.slice(0, -1).join(", ") + " or " + formatted.at(-1);
}

/**
 * @param {{ specifier?: unknown }} attribute
 */
function formatAttributeName(attribute) {
    return typeof attribute.specifier === "string"
        ? attribute.specifier
        : JSON.stringify(attribute);
}
