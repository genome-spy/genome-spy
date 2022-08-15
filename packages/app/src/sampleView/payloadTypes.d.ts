import { ComparisonOperatorType } from "./sampleOperations";
import { Sample } from "./sampleState";
import { AttributeIdentifier } from "./types";

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

export interface RemoveUndefined extends PayloadWithAttribute {}

export interface GroupByNominal extends PayloadWithAttribute {}

export interface GroupToQuartiles extends PayloadWithAttribute {}

export interface GroupByThresholds extends PayloadWithAttribute {
    thresholds: Threshold[];
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
