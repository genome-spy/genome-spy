import { ToolCallRejectionError } from "./agentToolErrors.js";
import {
    buildCategoricalFieldSummary,
    buildQuantitativeFieldSummary,
} from "@genome-spy/app/agentShared";
import { resolveAgentAttributeCandidate } from "./attributeCandidate.js";

const DEFAULT_MAX_GROUPS = 20;
const DEFAULT_MAX_EXACT_VALUE_COUNTS = 20;
const DEFAULT_MAX_HISTOGRAM_BINS = 12;
const VALUE_DISTRIBUTION_SIGNIFICANT_DIGITS = 6;

/**
 * @typedef {import("./agentToolInputs.d.ts").GetAttributeSummaryToolInput} GetAttributeSummaryToolInput
 * @typedef {import("@genome-spy/app/agentShared").AttributeIdentifier} AttributeIdentifier
 * @typedef {import("./agentToolInputs.d.ts").GetAttributeSummaryToolInput["scope"]} AttributeSummaryScope
 * @typedef {import("./types.d.ts").AgentGroupedAttributeSummarySource} AgentGroupedAttributeSummarySource
 * @typedef {import("./types.d.ts").AgentAttributeSummarySource} AgentAttributeSummarySource
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {{
 *     getAttributeSummarySource(
 *         attribute: AttributeIdentifier
 *     ): AgentAttributeSummarySource | undefined;
 *     getGroupedAttributeSummarySource(
 *         attribute: AttributeIdentifier
 *     ): AgentGroupedAttributeSummarySource | undefined;
 *     getAgentVolatileContext(): import("./types.js").AgentVolatileContext;
 * }} AttributeSummaryToolRuntime
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Returns a compact summary of one attribute's current values.
 *
 * @param {AttributeSummaryToolRuntime} runtime
 * @param {GetAttributeSummaryToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function getAttributeSummaryTool(runtime, input) {
    validateAttributeCandidate(input.attribute);
    validateScope(input.scope);
    const attribute = resolveAgentAttributeCandidate(runtime, input.attribute);

    if (input.scope === "visible_groups") {
        return buildGroupedAttributeSummary(runtime, attribute);
    }

    const source = runtime.getAttributeSummarySource(attribute);
    if (!source) {
        throw new ToolCallRejectionError(
            "The requested attribute was not found in the current sample view."
        );
    }

    const content =
        source.dataType === "quantitative"
            ? buildQuantitativeSummary(source)
            : buildCategoricalSummary(source);

    return {
        text: buildSummaryText(content),
        content,
    };
}

/**
 * @param {AttributeSummaryToolRuntime} runtime
 * @param {AttributeIdentifier} attribute
 * @returns {AgentToolExecutionResult}
 */
function buildGroupedAttributeSummary(runtime, attribute) {
    const source = runtime.getGroupedAttributeSummarySource(attribute);
    if (!source) {
        throw new ToolCallRejectionError(
            "The requested attribute was not found in the current sample view."
        );
    }

    if (source.groupLevels.length === 0 || source.groups.length === 0) {
        throw new ToolCallRejectionError(
            "The current sample hierarchy does not contain visible groups."
        );
    }

    const visibleGroups = source.groups.slice(0, DEFAULT_MAX_GROUPS);
    const groups =
        source.dataType === "quantitative"
            ? visibleGroups.map((group) => ({
                  path: group.path,
                  titles: group.titles,
                  title: group.title,
                  ...buildQuantitativeAgentSummary(
                      group.sampleIds.map(
                          (sampleId) => source.valuesBySampleId[sampleId]
                      )
                  ),
              }))
            : visibleGroups.map((group) => ({
                  path: group.path,
                  titles: group.titles,
                  title: group.title,
                  ...buildCategoricalFieldSummary(
                      group.sampleIds.map(
                          (sampleId) => source.valuesBySampleId[sampleId]
                      )
                  ),
              }));

    const content = {
        kind: "grouped_attribute_summary",
        attribute: source.attribute,
        title: source.title,
        ...(source.description ? { description: source.description } : {}),
        dataType: source.dataType,
        scope: source.scope,
        ...buildSelectionAggregationMetadata(source.attribute, source.scope),
        groupLevels: source.groupLevels,
        groupCount: source.groups.length,
        groups,
        truncatedGroups: source.groups.length > DEFAULT_MAX_GROUPS,
    };

    return {
        text: `Summarized attribute ${source.title} across ${source.groups.length} visible groups.`,
        content,
    };
}

/**
 * @param {AgentAttributeSummarySource} source
 */
function buildQuantitativeSummary(source) {
    return {
        kind: "attribute_summary",
        attribute: source.attribute,
        title: source.title,
        ...(source.description ? { description: source.description } : {}),
        dataType: source.dataType,
        scope: source.scope,
        ...buildSelectionAggregationMetadata(source.attribute, source.scope),
        sampleCount: source.sampleIds.length,
        ...buildQuantitativeAgentSummary(source.values),
    };
}

/**
 * @param {AgentAttributeSummarySource} source
 */
function buildCategoricalSummary(source) {
    return {
        kind: "attribute_summary",
        attribute: source.attribute,
        title: source.title,
        ...(source.description ? { description: source.description } : {}),
        dataType: source.dataType,
        scope: source.scope,
        sampleCount: source.sampleIds.length,
        ...buildCategoricalFieldSummary(source.values),
    };
}

/**
 * @param {AttributeIdentifier} attribute
 * @param {AttributeSummaryScope} scope
 */
function buildSelectionAggregationMetadata(attribute, scope) {
    if (
        attribute.type !== "VALUE_AT_LOCUS" ||
        typeof attribute.specifier !== "object" ||
        attribute.specifier === null ||
        !("aggregation" in attribute.specifier)
    ) {
        return {};
    }

    const op = attribute.specifier.aggregation.op;

    return {
        selectionAggregation: {
            op,
            valueLevel: "sample",
            summaryLevel: scope,
            interpretation:
                scope === "visible_groups"
                    ? "Each value was first aggregated over the selected interval for one sample; each group summary describes the distribution of those per-sample values within that visible group."
                    : "Each value was first aggregated over the selected interval for one sample; these summary statistics describe the distribution of those per-sample values across visible samples.",
            nextStepHint:
                scope === "visible_groups"
                    ? "Compare group-level distributions; do not interpret a pooled mean as a sample count."
                    : 'For deeper comparison, first group samples with an intent action, then call getAttributeSummary again with scope: "visible_groups".',
        },
    };
}

/**
 * @param {unknown[]} values
 */
function buildQuantitativeAgentSummary(values) {
    return {
        ...buildQuantitativeFieldSummary(values),
        ...buildQuantitativeSignSummary(values),
        valueDistribution: buildValueDistribution(values),
    };
}

/**
 * @param {unknown[]} values
 */
function buildValueDistribution(values) {
    const numericValues = values
        .map(coerceNumericValue)
        .filter((value) => value !== undefined);
    /** @type {Map<number, number>} */
    const counts = new Map();

    for (const value of numericValues) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    if (counts.size <= DEFAULT_MAX_EXACT_VALUE_COUNTS) {
        return {
            kind: "value_counts",
            distinctCount: counts.size,
            counts: Array.from(counts.entries())
                .sort(([a], [b]) => a - b)
                .map(([value, count]) => ({
                    value,
                    count,
                    share: cleanDistributionNumber(
                        getShare(count, numericValues.length)
                    ),
                })),
        };
    }

    return buildHistogramDistribution(numericValues, counts.size);
}

/**
 * @param {number[]} values
 * @param {number} distinctCount
 */
function buildHistogramDistribution(values, distinctCount) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = niceStep((max - min) / DEFAULT_MAX_HISTOGRAM_BINS);
    const start = cleanNumber(Math.floor(min / step) * step);
    const stop = cleanNumber(Math.ceil(max / step) * step);
    const binCount = Math.max(1, Math.ceil((stop - start) / step));
    const bins = Array.from({ length: binCount }, (_, index) => ({
        bin: [
            cleanNumber(start + index * step),
            cleanNumber(start + (index + 1) * step),
        ],
        count: 0,
        share: 0,
    }));

    for (const value of values) {
        const index = Math.min(
            Math.floor((value - start) / step),
            bins.length - 1
        );
        bins[index].count++;
    }

    for (const bin of bins) {
        bin.share = cleanDistributionNumber(getShare(bin.count, values.length));
    }

    return {
        kind: "histogram",
        distinctCount,
        binning: {
            start,
            stop: bins[bins.length - 1].bin[1],
            step,
        },
        bins,
    };
}

/**
 * @param {number} step
 */
function niceStep(step) {
    const power = Math.floor(Math.log10(step));
    const base = 10 ** power;
    const error = step / base;

    if (error >= 5) {
        return 10 * base;
    } else if (error >= 2) {
        return 5 * base;
    } else if (error >= 1) {
        return 2 * base;
    } else {
        return base;
    }
}

/**
 * @param {number} value
 */
function cleanNumber(value) {
    return Number(value.toPrecision(12));
}

/**
 * @param {number} value
 */
function cleanDistributionNumber(value) {
    return Number(value.toPrecision(VALUE_DISTRIBUTION_SIGNIFICANT_DIGITS));
}

/**
 * @param {unknown[]} values
 */
function buildQuantitativeSignSummary(values) {
    let negativeCount = 0;
    let zeroCount = 0;
    let positiveCount = 0;

    for (const value of values) {
        const numericValue = coerceNumericValue(value);
        if (numericValue === undefined) {
            continue;
        }

        if (numericValue < 0) {
            negativeCount++;
        } else if (numericValue === 0) {
            zeroCount++;
        } else {
            positiveCount++;
        }
    }

    const nonZeroCount = negativeCount + positiveCount;
    const nonMissingCount = negativeCount + zeroCount + positiveCount;

    return {
        negativeCount,
        zeroCount,
        positiveCount,
        nonZeroCount,
        negativeShare: getShare(negativeCount, nonMissingCount),
        zeroShare: getShare(zeroCount, nonMissingCount),
        positiveShare: getShare(positiveCount, nonMissingCount),
        nonZeroShare: getShare(nonZeroCount, nonMissingCount),
    };
}

/**
 * @param {number} value
 * @param {number} total
 */
function getShare(value, total) {
    return total > 0 ? value / total : 0;
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function coerceNumericValue(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : undefined;
    }

    return undefined;
}

/**
 * @param {ReturnType<typeof buildQuantitativeSummary> | ReturnType<typeof buildCategoricalSummary>} content
 * @returns {string}
 */
function buildSummaryText(content) {
    if (content.dataType === "quantitative") {
        return `Summarized attribute ${content.title} across ${content.nonMissingCount} non-missing samples.`;
    }

    if ("distinctCount" in content) {
        return `Summarized attribute ${content.title} with ${content.distinctCount} observed categories.`;
    }

    throw new Error("Categorical attribute summary is missing distinctCount.");
}

/**
 * @param {import("./agentToolInputs.d.ts").AgentAttributeCandidate} attribute
 */
function validateAttributeCandidate(attribute) {
    if (!attribute || typeof attribute !== "object") {
        throw new ToolCallRejectionError(
            "Attribute must be an attribute candidate object."
        );
    }

    if (
        attribute.type !== "SAMPLE_ATTRIBUTE" &&
        attribute.type !== "SELECTION_AGGREGATION"
    ) {
        throw new ToolCallRejectionError(
            "Only SAMPLE_ATTRIBUTE and SELECTION_AGGREGATION candidates are supported by this tool."
        );
    }

    if (
        attribute.type === "SAMPLE_ATTRIBUTE" &&
        typeof attribute.specifier !== "string"
    ) {
        throw new ToolCallRejectionError(
            "Sample attribute specifier must be a string."
        );
    }

    if (
        attribute.type === "SELECTION_AGGREGATION" &&
        (typeof attribute.candidateId !== "string" ||
            typeof attribute.aggregation !== "string")
    ) {
        throw new ToolCallRejectionError(
            "Selection aggregation candidates require candidateId and aggregation."
        );
    }
}

/**
 * @param {AttributeSummaryScope} scope
 */
function validateScope(scope) {
    if (scope !== "visible_samples" && scope !== "visible_groups") {
        throw new ToolCallRejectionError(
            "Attribute summary scope must be `visible_samples` or `visible_groups`."
        );
    }
}
