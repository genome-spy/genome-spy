// Shared helper surface for agent-facing utilities that both the App and the
// future extracted agent package can import.
// Host state and mutation access stays on AgentApi.
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
import { sampleSlice } from "../sampleView/state/sampleSlice.js";
import { paramProvenanceSlice } from "../state/paramProvenanceSlice.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
export { faStyles, formStyles } from "../components/generic/componentStyles.js";
import templateResultToString from "../utils/templateResultToString.js";
export { default as safeMarkdown } from "../utils/safeMarkdown.js";

export {
    makeViewSelectorKey,
    formatScopedParamName,
    serializeBookmarkableParamValue,
    isBaselineAction,
    createSelectionAggregationCandidateId,
    getContextMenuFieldInfos,
    buildSelectionAggregationAttributeIdentifier,
    formatAggregationExpression,
    templateResultToString,
};

/**
 * @typedef {import("../sampleView/state/sampleSlice.js").SampleActionType
 * | `paramProvenance/${keyof typeof import("../state/paramProvenanceSlice.js").paramProvenanceSlice.actions}`
 * | `viewSettings/${keyof typeof import("../viewSettingsSlice.js").viewSettingsSlice.actions}`} SupportedActionType
 */

/**
 * @param {SupportedActionType} actionType
 * @returns {(payload: any) => import("@reduxjs/toolkit").PayloadAction<any>}
 */
export function getActionCreator(actionType) {
    if (actionType.startsWith("sampleView/")) {
        return /** @type {Record<string, any>} */ (sampleSlice.actions)[
            actionType.slice("sampleView/".length)
        ];
    }

    if (actionType.startsWith("paramProvenance/")) {
        return /** @type {Record<string, any>} */ (
            paramProvenanceSlice.actions
        )[actionType.slice("paramProvenance/".length)];
    }

    if (actionType.startsWith("viewSettings/")) {
        return /** @type {Record<string, any>} */ (viewSettingsSlice.actions)[
            actionType.slice("viewSettings/".length)
        ];
    }

    throw new Error("Unsupported app actionType " + actionType + ".");
}
