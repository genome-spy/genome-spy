/**
 * Shared helper surface for pure utilities and generated helper data used by
 * the App and the future extracted agent package.
 *
 * Host state and mutation access stays on `AgentApi`.
 */
export { makeViewSelectorKey } from "../viewSettingsUtils.js";
export { formatScopedParamName } from "../viewScopeUtils.js";
export { serializeBookmarkableParamValue } from "../state/paramValueSerialization.js";
export { isBaselineAction } from "../state/provenanceBaseline.js";
export {
    createSelectionAggregationCandidateId,
    getContextMenuFieldInfos,
} from "../sampleView/selectionAggregationCandidates.js";
export { buildSelectionAggregationAttributeIdentifier } from "../sampleView/selectionAggregationAttributes.js";
export { formatAggregationExpression } from "../sampleView/attributeAggregation/aggregationOps.js";
export { default as generatedActionCatalog } from "../agent/generated/generatedActionCatalog.json";
