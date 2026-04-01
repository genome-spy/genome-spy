/* eslint-disable @typescript-eslint/no-empty-object-type */
/*
 * Many payload types are empty interfaces that extend PayloadWithAttribute.
 * They are semantically distinct types for FSA actions but don't add new properties.
 * Using interfaces keeps them consistent with other payload types in this file.
 */

import { Scalar } from "@genome-spy/core/spec/channel.js";
import { Sample } from "./sampleState.js";
import { AggregationSpec, AttributeIdentifier, Interval } from "../types.js";
import { SampleAttributeDef } from "@genome-spy/app/spec/sampleView.js";

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
    /**
     * Samples to install as the current collection.
     *
     * Each sample must have a unique `id`.
     */
    samples: Sample[];
}

export interface SetMetadata {
    /**
     * Metadata encoded in columnar form, aligned to the sample order.
     */
    columnarMetadata: ColumnarMetadata;

    /**
     * Optional attribute definitions for the incoming metadata columns.
     */
    attributeDefs?: Record<AttributeName, SampleAttributeDef>;

    /**
     * If true, the provided metadata will replace existing metadata
     * instead of being added to them.
     */
    replace?: boolean;
}

export interface DeriveMetadata extends PayloadWithAttribute {
    /**
     * Name of the derived metadata column.
     *
     * The resulting metadata is written under this name.
     */
    name: string;

    /**
     * Optional metadata group path for the derived column.
     */
    groupPath?: string;

    /**
     * Optional scale definition for the derived metadata column.
     */
    scale?: SampleAttributeDef["scale"];
}

export interface AddMetadataFromSource {
    /**
     * Optional source identifier.
     * If omitted, source resolution is allowed only when exactly one source exists.
     */
    sourceId?: string;

    /**
     * Columns requested from the source.
     */
    columnIds: string[];

    /**
     * Optional metadata group path override.
     */
    groupPath?: string;

    /**
     * If true, replace existing metadata instead of merging.
     */
    replace?: boolean;

    /**
     * @hidden
     */
    _augmented?: {
        metadata: SetMetadata;
    };
}

export type ThresholdOperator = "lt" | "lte";

export type ComparisonOperatorType = "lt" | "lte" | "eq" | "gte" | "gt";

/**
 * Numeric threshold used when partitioning or filtering quantitative values.
 */
export interface Threshold {
    /**
     * Threshold side to use when creating groups.
     */
    operator: ThresholdOperator;

    /**
     * Numeric threshold value.
     */
    operand: number;
}

export interface IntervalAggregation {
    interval: Interval;
    aggregation: AggregationSpec;
}

/**
 * @hidden
 */
export interface AugmentedAttribute {
    /** Values accessed just prior to dispatching the action to reducers */
    values: Record<string, any>;
    /** Domain of the accessed attribute, if needed */
    domain?: Scalar[];
    /** Derived metadata payload computed prior to dispatch */
    metadata?: SetMetadata;
}

/**
 * Payloads that reference an abstract attribute include this interface.
 * As some of the attributes reside outside the redux store, their values
 * are accessed just prior to dispatching the action to reducers and
 * stored in `_augmented` here for later use.
 */
export interface PayloadWithAttribute {
    /**
     * Attribute identifier used by the action.
     */
    attribute: AttributeIdentifier;

    /**
     * @hidden
     */
    _augmented?: AugmentedAttribute;
}

/**
 * Payload for sorting samples by an attribute.
 */
export interface SortBy extends PayloadWithAttribute {}

/**
 * Payload for retaining the first sample of each category.
 */
export interface RetainFirstOfEach extends PayloadWithAttribute {}

export interface RetainFirstNCategories extends PayloadWithAttribute {
    /**
     * Number of categories to retain.
     *
     * @minimum 1
     */
    n: number;
}

/**
 * Payload for removing samples missing an attribute value.
 */
export interface RemoveUndefined extends PayloadWithAttribute {}

/**
 * Payload for grouping by a categorical attribute.
 */
export interface GroupByNominal extends PayloadWithAttribute {}

/**
 * Payload for grouping by quartiles.
 */
export interface GroupToQuartiles extends PayloadWithAttribute {}

export interface GroupByThresholds extends PayloadWithAttribute {
    /**
     * Thresholds used to stratify the samples.
     */
    thresholds: [Threshold, ...Threshold[]];
}

export interface RemoveGroup {
    /**
     * An array of group names that represent the path to the group.
     * The implicit ROOT group is excluded. */
    path: string[];
}

/**
 * Payload for filtering samples by comparing a quantitative attribute
 * against a numeric operand.
 */
export interface FilterByQuantitative extends PayloadWithAttribute {
    /**
     * Comparison operator used for thresholding.
     */
    operator: ComparisonOperatorType;

    /**
     * Numeric threshold used in the comparison.
     */
    operand: number;
}

export interface FilterByNominal extends PayloadWithAttribute {
    /**
     * Discrete values to match.
     */
    values: any[];

    /**
     * If true, matching samples are removed instead of retained.
     */
    remove?: boolean;
}

export interface RetainMatched extends PayloadWithAttribute {
    /**
     * Attribute whose categories must be present in all current groups.
     */
    attribute: AttributeIdentifier;
}

/**
 * Which categories belong to which group.
 */
export type CustomGroups = Record<string, Scalar[]>;

export interface GroupCustom extends PayloadWithAttribute {
    /**
     * A record where the keys are group names and the values are arrays of
     * categories or sample ids.
     */
    groups: CustomGroups;
}
