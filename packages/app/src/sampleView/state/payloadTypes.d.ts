import { Scalar } from "@genome-spy/core/spec/channel.js";
import { ComparisonOperatorType } from "./sampleOperations.js";
import { Sample, Metadata } from "./sampleState.js";
import { AttributeIdentifier } from "../types.js";
import { SampleAttributeDef } from "@genome-spy/core/spec/sampleView.js";

export interface SetSamples {
    samples: Sample[];
}

export interface SetMetadata {
    metadata: Metadata;

    attributeDefs?: Record<string, SampleAttributeDef>;

    /**
     * If true, the provided metadata will replace existing metadata
     * instead of being added to them.
     */
    replace?: boolean;
}

export type ThresholdOperator = "lt" | "lte";

export interface Threshold {
    operator: ThresholdOperator;
    operand: number;
}

export interface AugmentedAttribute {
    /** Values accessed just prior to dispatching the action to reducers */
    values: Record<string, any>;
    /** Domain of the accessed attribute, if needed */
    domain?: Scalar[];
}

export interface PayloadWithAttribute {
    attribute: AttributeIdentifier;
    _augmented?: AugmentedAttribute;
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

/** Which categories belong to which group */
export type CustomGroups = Record<string, Scalar[]>;

export interface GroupCustom extends PayloadWithAttribute {
    /**
     * A record where the keys are group names and the values are arrays of
     * categories or sample ids.
     */
    groups: CustomGroups;
}
