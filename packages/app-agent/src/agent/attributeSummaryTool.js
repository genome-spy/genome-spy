import { ToolCallRejectionError } from "./agentToolErrors.js";
import {
    buildCategoricalFieldSummary,
    buildQuantitativeFieldSummary,
} from "@genome-spy/app/agentShared";
import { resolveAgentAttributeCandidate } from "./attributeCandidate.js";

const DEFAULT_MAX_GROUPS = 20;

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
 * @param {unknown[]} values
 */
function buildQuantitativeAgentSummary(values) {
    return {
        ...buildQuantitativeFieldSummary(values),
        ...buildQuantitativeSignSummary(values),
    };
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
