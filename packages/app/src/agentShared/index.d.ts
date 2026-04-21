/**
 * Shared helper surface for agent-facing utilities used by the App and the
 * future extracted agent package.
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
export { default as templateResultToString } from "../utils/templateResultToString.js";
export { faStyles, formStyles } from "../components/generic/componentStyles.js";
export { default as safeMarkdown } from "../utils/safeMarkdown.js";

type SupportedActionType =
    | `sampleView/${import("../sampleView/state/sampleSlice.js").SampleActionType}`
    | `paramProvenance/${keyof typeof import("../state/paramProvenanceSlice.js").paramProvenanceSlice.actions}`
    | `viewSettings/${keyof typeof import("../viewSettingsSlice.js").viewSettingsSlice.actions}`;

export declare function getActionCreator(
    actionType: SupportedActionType
): (payload: any) => import("@reduxjs/toolkit").PayloadAction<any>;
