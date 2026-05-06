/**
 * `agentShared` exposes App internals to the agent and plugin surfaces only.
 * Do not add App code here that the rest of App should depend on.
 *
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
export {
    buildCategoricalCountsSummary,
    buildCategoricalFieldSummary,
    buildQuantitativeFieldSummary,
    buildTopCategorySummary,
} from "../utils/statistics/fieldSummary.js";
export type { ParamSelector, ViewSelector } from "./types.d.ts";
export type {
    AggregationOp,
    AttributeIdentifier,
    AttributeIdentifierType,
    AttributeInfo,
    AttributeEnsureContext,
    AttributeValuesScope,
    AggregationSpec,
    Interval,
    IntervalPoint,
} from "../sampleView/types.d.ts";
export type { AppRootSpec } from "../spec/appSpec.d.ts";
export type { ActionInfo, ProvenanceAction } from "../state/provenance.js";
export type { AppState } from "../state/setupStore.js";
export type {
    BaseGroup,
    Group,
    GroupGroup,
    GroupMetadata,
    Metadatum,
    Metadata,
    Sample,
    SampleGroup,
    SampleHierarchy,
    SampleId,
    SampleMetadata,
} from "../sampleView/state/sampleState.d.ts";
export type {
    ExpandPointSelectionActionPayload,
    ParamOrigin,
    ParamProvenanceEntry,
    ParamProvenanceState,
    ParamValue,
    ParamValueInterval,
    ParamValueLiteral,
    ParamValuePoint,
    ParamValuePointExpand,
    PointExpandMatcher,
    PointExpandOrigin,
} from "../state/paramProvenanceTypes.d.ts";
export type {
    IntervalCarrier,
    IntervalReference,
    IntervalSpecifier,
    LocusSpecifier,
    SelectionIntervalSource,
    ViewAttributeSpecifier,
    ViewRef,
} from "../sampleView/sampleViewTypes.d.ts";
export type * from "../sampleView/state/payloadTypes.d.ts";
export type {
    SampleAttributeDef,
    SampleAttributeType,
} from "../spec/sampleView.d.ts";

type SupportedActionType =
    | `sampleView/${import("../sampleView/state/sampleSlice.js").SampleActionType}`
    | `paramProvenance/${keyof typeof import("../state/paramProvenanceSlice.js").paramProvenanceSlice.actions}`
    | `viewSettings/${keyof typeof import("../viewSettingsSlice.js").viewSettingsSlice.actions}`;

export declare function getActionCreator(
    actionType: SupportedActionType
): (payload: any) => import("@reduxjs/toolkit").PayloadAction<any>;
