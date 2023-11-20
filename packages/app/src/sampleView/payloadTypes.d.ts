import { ComparisonOperatorType } from "./sampleOperations.js";
import { Sample } from "./sampleState.js";
import { AttributeIdentifier } from "./types.js";

export interface SetSamples {
    samples: Sample[];
}

export type ThresholdOperator = "lt" | "lte";

export interface Threshold {
    operator: ThresholdOperator;
    operand: number;
}

export interface PayloadWithAttribute {
    attribute: AttributeIdentifier;
}

export interface SortBy extends PayloadWithAttribute {}

export interface RetainFirstOfEach extends PayloadWithAttribute {}

export interface RetainFirstNCategories extends PayloadWithAttribute {
    /** Number of categories to retain */
    n: number;
}

export interface RemoveUndefined extends PayloadWithAttribute {}

export interface GroupByNominal extends PayloadWithAttribute {}

export interface GroupToQuartiles extends PayloadWithAttribute {}

export interface GroupByThresholds extends PayloadWithAttribute {
    thresholds: Threshold[];
}

export interface RemoveGroup {
    /**
     * An array of group names that represent the path to the group.
     * The implicit ROOT group is excluded. */
    path: string[];
}

export interface FilterByQuantitative extends PayloadWithAttribute {
    /** The comparison operator */
    operator: ComparisonOperatorType;

    operand: number;
}

export interface FilterByNominal extends PayloadWithAttribute {
    values: any[];

    /** Should the matching samples be removed instead of retained (default) */
    remove?: boolean;
}

export interface RetainMatched extends PayloadWithAttribute {
    attribute: AttributeIdentifier;
}
