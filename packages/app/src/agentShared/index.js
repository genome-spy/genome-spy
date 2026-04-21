// Shared helper surface for pure utilities and generated helper data that
// both the App and the future extracted agent package can import.
// Host state and mutation access stays on AgentApi.
import generatedActionCatalog from "../agent/generated/generatedActionCatalog.json" with { type: "json" };
import { makeViewSelectorKey } from "../viewSettingsUtils.js";
import { formatScopedParamName } from "../viewScopeUtils.js";
import { serializeBookmarkableParamValue } from "../state/paramValueSerialization.js";
import { isBaselineAction } from "../state/provenanceBaseline.js";
import {
    createSelectionAggregationCandidateId,
    getContextMenuFieldInfos,
} from "../sampleView/selectionAggregationCandidates.js";
import { buildSelectionAggregationAttributeIdentifier } from "../sampleView/selectionAggregationAttributes.js";
import { formatAggregationExpression } from "../sampleView/attributeAggregation/aggregationOps.js";

export {
    generatedActionCatalog,
    makeViewSelectorKey,
    formatScopedParamName,
    serializeBookmarkableParamValue,
    isBaselineAction,
    createSelectionAggregationCandidateId,
    getContextMenuFieldInfos,
    buildSelectionAggregationAttributeIdentifier,
    formatAggregationExpression,
};
