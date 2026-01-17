/* eslint-disable @typescript-eslint/no-empty-object-type */
/*
 * Many payload types are empty interfaces that extend PayloadWithAttribute.
 * They are semantically distinct types for FSA actions but don't add new properties.
 * Using interfaces keeps them consistent with other payload types in this file.
 */

import { Scalar } from "@genome-spy/core/spec/channel.js";
import { ComparisonOperatorType } from "./sampleOperations.js";
import { Sample } from "./sampleState.js";
import { AttributeIdentifier } from "../types.js";
import { SampleAttributeDef } from "@genome-spy/core/spec/sampleView.js";

/*
 * This file defines the payload types for actions that modify sample view state.
 * The actions conform to the Flux Standard Action (FSA) pattern,
 * where the payload is contained in the `payload` property of the action object.
 * See [FSA](https://github.com/redux-utilities/flux-standard-action?tab=readme-ov-file#example)
 * 
 * Some utility types related to sample view state are also defined here.

 * Note: There are two types of paths:
 *   1. Metadata attribute paths, which identify attributes in the metadata hierarchy.
 *   2. Sample group paths, which identify groups in the sample grouping hierarchy.

 * These are both represented as string arrays, but they refer to different hierarchies.
 */

/**
 * An identifier or name for a sample attribute.
 *
 * As the identifiers may represent paths in a hierarchy, they are strings
 * where path segments are separated by a forward slash ('/').
 * Separators in path segments are always escaped to avoid ambiguity.
 */
export type AttributeName = string;

/**
 * Columnar metadata representation
 * Keys are attribute names, values are arrays of attribute values
 * for each sample, in the same order as the samples array.
 *
 * Columnar format is more efficient for storage in bookmarked actions.
 */
export interface ColumnarMetadata {
    /**
     * Required sample identifier
     */
    sample: string[];

    /**
     * Attributes
     */
    [key: AttributeName]: Scalar[];
}

export interface SetSamples {
    samples: Sample[];
}

export interface SetMetadata {
    columnarMetadata: ColumnarMetadata;

    attributeDefs?: Record<AttributeName, SampleAttributeDef>;

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

/**
 * @internal
 */
export interface AugmentedAttribute {
    /** Values accessed just prior to dispatching the action to reducers */
    values: Record<string, any>;
    /** Domain of the accessed attribute, if needed */
    domain?: Scalar[];
}

/**
 * Payloads that reference an abstract attribute include this interface.
 * As some of the attributes reside outside the redux store, their values
 * are accessed just prior to dispatching the action to reducers and
 * stored in `_augmented` here for later use.
 */
export interface PayloadWithAttribute {
    attribute: AttributeIdentifier;

    /**
     * @internal
     */
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
