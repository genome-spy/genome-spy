/**
 * This file is generated. Do not edit.
 */
type Scalar = string | number | boolean | null;

type ChromosomalLocus = {
    chrom: string;
    pos: number;
};

type ViewSelector = {
    scope: string[];
    view: string;
};

type ParamSelector = {
    scope: string[];
    param: string;
};

type AttributeIdentifierType =
    | "SAMPLE_ATTRIBUTE"
    | "VALUE_AT_LOCUS"
    | "SAMPLE_NAME"
    | "VIEW_ATTRIBUTE";

type AttributeIdentifier = {
    type: AttributeIdentifierType;
    specifier?: string | Record<string, unknown>;
};

type PayloadWithAttribute = {
    attribute: AttributeIdentifier;
};

type ThresholdOperator = "lt" | "lte";

type ComparisonOperatorType = "lt" | "lte" | "eq" | "gte" | "gt";

type Threshold = {
    operator: ThresholdOperator;
    operand: number;
};

type SampleAttributeDef = {
    scale?: unknown;
};

type ColumnarMetadata = Record<string, Scalar[]> & {
    sample: Scalar[];
};

type CustomGroups = Record<string, Scalar[]>;

type SetMetadata = {
    columnarMetadata: ColumnarMetadata;
    attributeDefs?: Record<string, SampleAttributeDef>;
    replace?: boolean;
};

type DeriveMetadata = PayloadWithAttribute & {
    name: string;
    groupPath?: string;
    scale?: unknown;
};

type AddMetadataFromSource = {
    sourceId?: string;
    columnIds: string[];
    groupPath?: string;
    replace?: boolean;
};

type SortBy = PayloadWithAttribute;

type RetainFirstOfEach = PayloadWithAttribute;

interface RetainFirstNCategories extends PayloadWithAttribute {
    /** @minimum 1 */
    n: number;
}

type RemoveUndefined = PayloadWithAttribute;

type GroupCustom = PayloadWithAttribute & {
    groups: CustomGroups;
};

type GroupByNominal = PayloadWithAttribute;

type GroupToQuartiles = PayloadWithAttribute;

type GroupByThresholds = PayloadWithAttribute & {
    thresholds: [Threshold, ...Threshold[]];
};

type RemoveGroup = {
    path: string[];
};

type FilterByQuantitative = PayloadWithAttribute & {
    operator: ComparisonOperatorType;
    operand: number;
};

type FilterByNominal = PayloadWithAttribute & {
    values: unknown[];
    remove?: boolean;
};

type RetainMatched = PayloadWithAttribute;

type ParamValueLiteral = {
    type: "value";
    value: unknown;
};

type ParamValueInterval = {
    type: "interval";
    intervals: Partial<
        Record<
            "x" | "y",
            [number, number] | [ChromosomalLocus, ChromosomalLocus] | null
        >
    >;
};

type ParamValuePoint = {
    type: "point";
    keyFields: string[];
    keys: Scalar[][];
};

type ParamOrigin = {
    type: "datum";
    view: ViewSelector;
    keyField: string;
    key: Scalar;
    intervalSources?: Record<string, { start?: string; end?: string }>;
};

type PointExpandOrigin = {
    view: ViewSelector;
    keyTuple: Scalar[];
    keyFields?: string[];
    type?: "datum";
};

type PointExpandMatcher =
    | { rule: unknown; predicate?: never }
    | { predicate: unknown; rule?: never };

type ParamValuePointExpand = {
    type: "pointExpand";
    operation: "replace" | "add" | "remove" | "toggle";
    partitionBy?: string[];
    origin: PointExpandOrigin;
} & PointExpandMatcher;

type ParamValue =
    | ParamValueLiteral
    | ParamValueInterval
    | ParamValuePoint
    | ParamValuePointExpand;

type ParamProvenanceEntry = {
    selector: ParamSelector;
    value: ParamValue;
    origin?: ParamOrigin;
};

export type AgentActionType =
    | "sampleView/addMetadata"
    | "sampleView/deriveMetadata"
    | "sampleView/addMetadataFromSource"
    | "sampleView/sortBy"
    | "sampleView/retainFirstOfEach"
    | "sampleView/retainFirstNCategories"
    | "sampleView/filterByQuantitative"
    | "sampleView/filterByNominal"
    | "sampleView/removeUndefined"
    | "sampleView/groupCustomCategories"
    | "sampleView/groupByNominal"
    | "sampleView/groupToQuartiles"
    | "sampleView/groupByThresholds"
    | "sampleView/removeGroup"
    | "sampleView/retainMatched"
    | "paramProvenance/paramChange";

export type AgentIntentProgramStep =
    | {
          actionType: "sampleView/addMetadata";
          payload: SetMetadata;
      }
    | {
          actionType: "sampleView/deriveMetadata";
          payload: DeriveMetadata;
      }
    | {
          actionType: "sampleView/addMetadataFromSource";
          payload: AddMetadataFromSource;
      }
    | {
          actionType: "sampleView/sortBy";
          payload: SortBy;
      }
    | {
          actionType: "sampleView/retainFirstOfEach";
          payload: RetainFirstOfEach;
      }
    | {
          actionType: "sampleView/retainFirstNCategories";
          payload: RetainFirstNCategories;
      }
    | {
          actionType: "sampleView/filterByQuantitative";
          payload: FilterByQuantitative;
      }
    | {
          actionType: "sampleView/filterByNominal";
          payload: FilterByNominal;
      }
    | {
          actionType: "sampleView/removeUndefined";
          payload: RemoveUndefined;
      }
    | {
          actionType: "sampleView/groupCustomCategories";
          payload: GroupCustom;
      }
    | {
          actionType: "sampleView/groupByNominal";
          payload: GroupByNominal;
      }
    | {
          actionType: "sampleView/groupToQuartiles";
          payload: GroupToQuartiles;
      }
    | {
          actionType: "sampleView/groupByThresholds";
          payload: GroupByThresholds;
      }
    | {
          actionType: "sampleView/removeGroup";
          payload: RemoveGroup;
      }
    | {
          actionType: "sampleView/retainMatched";
          payload: RetainMatched;
      }
    | {
          actionType: "paramProvenance/paramChange";
          payload: ParamProvenanceEntry;
      };
