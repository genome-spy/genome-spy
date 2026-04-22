/**
 * Narrow, internal type barrel for agent action payloads.
 *
 * This exists so generator scripts can import the exact payload declarations
 * they need without reaching into app internals directly or copying shapes.
 */
export type {
    AddMetadataFromSource,
    DeriveMetadata,
    FilterByNominal,
    FilterByQuantitative,
    GroupByNominal,
    GroupByThresholds,
    GroupCustom,
    GroupToQuartiles,
    RemoveGroup,
    RemoveUndefined,
    RetainFirstNCategories,
    RetainFirstOfEach,
    RetainMatched,
    SetMetadata,
    SortBy,
} from "../sampleView/state/payloadTypes.d.ts";

export type { ParamProvenanceEntry } from "../state/paramProvenanceTypes.d.ts";
