import { ToolCallRejectionError } from "./agentToolErrors.js";
import {
    buildCategoricalFieldSummary,
    buildQuantitativeFieldSummary,
} from "./metadataSummaryReducers.js";

const DEFAULT_MAX_GROUPS = 20;

/**
 * @typedef {import("./agentToolInputs.d.ts").GetGroupedMetadataAttributeSummaryToolInput} GetGroupedMetadataAttributeSummaryToolInput
 * @typedef {import("../sampleView/types.d.ts").AttributeIdentifier} AttributeIdentifier
 * @typedef {import("./types.d.ts").AgentGroupedMetadataAttributeSummarySource} AgentGroupedMetadataAttributeSummarySource
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {{
 *     getGroupedMetadataAttributeSummarySource(
 *         attribute: AttributeIdentifier
 *     ): AgentGroupedMetadataAttributeSummarySource | undefined;
 * }} GroupedMetadataAttributeSummaryToolRuntime
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Returns grouped summaries for one metadata attribute using the current
 * visible grouping hierarchy.
 *
 * @param {GroupedMetadataAttributeSummaryToolRuntime} runtime
 * @param {GetGroupedMetadataAttributeSummaryToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function getGroupedMetadataAttributeSummaryTool(runtime, input) {
    if (!input.attribute || typeof input.attribute !== "object") {
        throw new ToolCallRejectionError(
            "Attribute must be a metadata AttributeIdentifier object."
        );
    }

    if (input.attribute.type !== "SAMPLE_ATTRIBUTE") {
        throw new ToolCallRejectionError(
            "Only SAMPLE_ATTRIBUTE identifiers are supported by this tool."
        );
    }

    if (typeof input.attribute.specifier !== "string") {
        throw new ToolCallRejectionError(
            "Metadata attribute specifier must be a string."
        );
    }

    const source = runtime.getGroupedMetadataAttributeSummarySource(
        input.attribute
    );
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
