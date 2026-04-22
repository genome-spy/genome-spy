import { ToolCallRejectionError } from "./agentToolErrors.js";
import {
    buildCategoricalFieldSummary,
    buildQuantitativeFieldSummary,
} from "./metadataSummaryReducers.js";

const DEFAULT_MAX_GROUPS = 20;

/**
 * @typedef {import("./agentToolInputs.d.ts").GetMetadataAttributeSummaryToolInput} GetMetadataAttributeSummaryToolInput
 * @typedef {import("@genome-spy/app").AttributeIdentifier} AttributeIdentifier
 * @typedef {import("./agentToolInputs.d.ts").GetMetadataAttributeSummaryToolInput["scope"]} MetadataSummaryScope
 * @typedef {import("./types.d.ts").AgentGroupedMetadataAttributeSummarySource} AgentGroupedMetadataAttributeSummarySource
 * @typedef {import("./types.d.ts").AgentMetadataAttributeSummarySource} AgentMetadataAttributeSummarySource
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {{
 *     getMetadataAttributeSummarySource(
 *         attribute: AttributeIdentifier
 *     ): AgentMetadataAttributeSummarySource | undefined;
 *     getGroupedMetadataAttributeSummarySource(
 *         attribute: AttributeIdentifier
 *     ): AgentGroupedMetadataAttributeSummarySource | undefined;
 * }} MetadataAttributeSummaryToolRuntime
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Returns a compact summary of one metadata attribute's current values.
 *
 * @param {MetadataAttributeSummaryToolRuntime} runtime
 * @param {GetMetadataAttributeSummaryToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function getMetadataAttributeSummaryTool(runtime, input) {
    validateAttribute(input.attribute);
    validateScope(input.scope);

    if (input.scope === "visible_groups") {
        return buildGroupedMetadataSummary(runtime, input.attribute);
    }

    const source = runtime.getMetadataAttributeSummarySource(input.attribute);
    if (!source) {
        throw new ToolCallRejectionError(
            "The requested metadata attribute was not found in the current sample view."
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
 * @param {MetadataAttributeSummaryToolRuntime} runtime
 * @param {AttributeIdentifier} attribute
 * @returns {AgentToolExecutionResult}
 */
function buildGroupedMetadataSummary(runtime, attribute) {
    const source = runtime.getGroupedMetadataAttributeSummarySource(attribute);
    if (!source) {
        throw new ToolCallRejectionError(
            "The requested metadata attribute was not found in the current sample view."
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
                  ...buildQuantitativeFieldSummary(
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
        kind: "grouped_metadata_attribute_summary",
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
        text: `Summarized metadata attribute ${source.title} across ${source.groups.length} visible groups.`,
        content,
    };
}

/**
 * @param {AgentMetadataAttributeSummarySource} source
 */
function buildQuantitativeSummary(source) {
    return {
        kind: "metadata_attribute_summary",
        attribute: source.attribute,
        title: source.title,
        ...(source.description ? { description: source.description } : {}),
        dataType: source.dataType,
        scope: source.scope,
        sampleCount: source.sampleIds.length,
        ...buildQuantitativeFieldSummary(source.values),
    };
}

/**
 * @param {AgentMetadataAttributeSummarySource} source
 */
function buildCategoricalSummary(source) {
    return {
        kind: "metadata_attribute_summary",
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
 * @param {ReturnType<typeof buildQuantitativeSummary> | ReturnType<typeof buildCategoricalSummary>} content
 * @returns {string}
 */
function buildSummaryText(content) {
    if (content.dataType === "quantitative") {
        return `Summarized metadata attribute ${content.title} across ${content.nonMissingCount} non-missing samples.`;
    }

    if ("distinctCount" in content) {
        return `Summarized metadata attribute ${content.title} with ${content.distinctCount} observed categories.`;
    }

    throw new Error("Categorical metadata summary is missing distinctCount.");
}

/**
 * @param {AttributeIdentifier} attribute
 */
function validateAttribute(attribute) {
    if (!attribute || typeof attribute !== "object") {
        throw new ToolCallRejectionError(
            "Attribute must be a metadata AttributeIdentifier object."
        );
    }

    if (attribute.type !== "SAMPLE_ATTRIBUTE") {
        throw new ToolCallRejectionError(
            "Only SAMPLE_ATTRIBUTE identifiers are supported by this tool."
        );
    }

    if (typeof attribute.specifier !== "string") {
        throw new ToolCallRejectionError(
            "Metadata attribute specifier must be a string."
        );
    }
}

/**
 * @param {MetadataSummaryScope} scope
 */
function validateScope(scope) {
    if (scope !== "visible_samples" && scope !== "visible_groups") {
        throw new ToolCallRejectionError(
            "Metadata summary scope must be `visible_samples` or `visible_groups`."
        );
    }
}
