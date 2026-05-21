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
     * Sample ids for the rows in this payload.
     *
     * Every other column must follow this same order.
     */
    sample: string[];

    /**
     * Metadata columns keyed by attribute name.
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
     *
     * Use this to preserve attribute types, titles, scales, or other metadata
     * settings instead of relying on inference.
     */
    attributeDefs?: Record<AttributeName, SampleAttributeDef>;

    /**
     * Whether to replace the current metadata set.
     *
     * If `true`, only the provided columns remain. If omitted or `false`, the
     * provided columns are merged into the existing metadata.
     */
    replace?: boolean;
}

export interface DeriveMetadata extends PayloadWithAttribute {
    /**
     * Name of the derived metadata column.
     *
     * This becomes the leaf attribute name written into metadata. Prefer a
     * short user-facing name.
     */
    name: string;

    /**
     * Optional metadata group path for the derived column.
     *
     * When provided, the resulting attribute is written under
     * `groupPath/name`.
     */
    groupPath?: string;

    /**
     * If omitted, derived metadata may inherit an authored source scale when
     * the aggregation preserves the source value domain. Use `null` to force
     * automatic scale inference without inheritance.
     */
    scale?: SampleAttributeDef["scale"] | null;
}

export interface AddMetadataFromSource {
    /**
     * Configured metadata source to read from.
     *
     * Omit this only when exactly one source is available.
     */
    sourceId?: string;

    /**
     * Column ids to import from the selected source.
     */
    columnIds: string[];

    /**
     * Optional metadata group path override for the imported columns.
     */
    groupPath?: string;

    /**
     * Whether to replace the current metadata set.
     *
     * If `true`, only the imported columns remain. If omitted or `false`, the
     * imported columns are merged into the existing metadata.
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
 * Exact categorical value used by nominal sample filters.
 */
export type NominalFilterValue = Scalar | null;

/**
 * Numeric threshold used when partitioning or filtering quantitative values.
 */
export interface Threshold {
    /**
     * Upper-bound comparison used for the interval ending at this threshold.
     *
     * `lt` makes the upper endpoint exclusive (`<`). `lte` makes the upper
     * endpoint inclusive (`<=`).
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
    /** Condition values for actions that compare two attributes */
    conditionValues?: Record<string, any>;
}

export interface QuantitativeAttributeCondition {
    /**
     * Quantitative attribute tested within each category.
     */
    attribute: AttributeIdentifier;

    /**
     * Comparison applied as `attributeValue operator operand`.
     */
    operator: ComparisonOperatorType;

    /**
     * Numeric value on the right-hand side of the comparison.
     */
    operand: number;
}

export interface CategoricalAttributeCondition {
    /**
     * Categorical or ordinal attribute tested within each category.
     */
    attribute: AttributeIdentifier;

    /**
     * Membership test applied as `attributeValue in values`.
     */
    operator: "in";

    /**
     * Attribute values that satisfy the condition.
     */
    values: Scalar[];

    /**
     * Requirement for selected values within each retained category.
     *
     * `any` retains a category when at least one sample has one of the selected
     * values. `all` requires every selected value to occur in at least one
     * sample in the category.
     *
     * __Default value:__ `"any"`
     */
    required?: "any" | "all";
}

export type AttributeCondition =
    | QuantitativeAttributeCondition
    | CategoricalAttributeCondition;

/**
 * Payloads that reference an abstract attribute include this interface.
 * As some of the attributes reside outside the redux store, their values
 * are accessed just prior to dispatching the action to reducers and
 * stored in `_augmented` here for later use.
 */
export interface PayloadWithAttribute {
    /**
     * Attribute operated on by the action.
     *
     * Its current values are resolved before the reducer runs and then used by
     * sorting, filtering, grouping, or metadata derivation.
     */
    attribute: AttributeIdentifier;

    /**
     * @hidden
     */
    _augmented?: AugmentedAttribute;
}

/**
 * Payload for sorting samples in descending order by an attribute.
 */
export interface SortBy extends PayloadWithAttribute {}

/**
 * Payload for retaining the first sample of each distinct category.
 */
export interface RetainFirstOfEach extends PayloadWithAttribute {}

export interface RetainFirstNCategories extends PayloadWithAttribute {
    /**
     * Maximum number of distinct categories to retain.
     *
     * Categories are taken in first-seen order within each current group.
     *
     * @minimum 1
     */
    n: number;
}

/**
 * Payload for removing samples whose attribute value is `undefined` or `null`.
 */
export interface RemoveUndefined extends PayloadWithAttribute {}

/**
 * Payload for grouping by a categorical or ordinal attribute.
 */
export interface GroupByNominal extends PayloadWithAttribute {}

/**
 * Payload for grouping a quantitative attribute into quartiles.
 */
export interface GroupToQuartiles extends PayloadWithAttribute {}

export interface GroupByThresholds extends PayloadWithAttribute {
    /**
     * Thresholds used to stratify the samples.
     *
     * Supply these in ascending operand order. Adjacent thresholds define the
     * output intervals.
     */
    thresholds: [Threshold, ...Threshold[]];

    /**
     * Optional display titles for the generated groups.
     *
     * When provided, the array must contain one title for each output interval:
     * exactly `thresholds.length + 1` titles. Titles are ordered from the
     * lowest interval to the highest interval, matching the ascending threshold
     * order. For thresholds `[10, 20]`, titles correspond to values below `10`,
     * values from `10` to `20`, and values above `20`.
     *
     * Titles must be non-empty and unique. The original interval labels are
     * still preserved for each group.
     */
    groupTitles?: string[];
}

export interface RemoveGroup {
    /**
     * Group names from outermost to innermost, excluding the implicit ROOT.
     */
    path: string[];
}

/**
 * Payload for filtering samples by comparing a quantitative attribute
 * against a numeric operand.
 */
export interface FilterByQuantitative extends PayloadWithAttribute {
    /**
     * Comparison applied as `attributeValue operator operand`.
     */
    operator: ComparisonOperatorType;

    /**
     * Numeric value on the right-hand side of the comparison.
     */
    operand: number;
}

export interface RetainCategoriesByAttribute extends PayloadWithAttribute {
    /**
     * Categorical attribute whose categories are retained.
     *
     * All samples with a retained category value are kept.
     */
    attribute: AttributeIdentifier;

    /**
     * Per-sample condition used to decide which values of `attribute` are retained.
     *
     * A value of `attribute` is retained when at least one sample with that value
     * satisfies this condition. All samples with retained `attribute` values are
     * kept.
     */
    condition: AttributeCondition;
}

export interface FilterByNominal extends PayloadWithAttribute {
    /**
     * Attribute values matched by exact equality.
     */
    values: NominalFilterValue[];

    /**
     * Whether to remove matching samples instead of retaining them.
     *
     * If omitted or `false`, only matching samples are kept.
     */
    remove?: boolean;
}

export interface RetainMatched extends PayloadWithAttribute {
    /**
     * Attribute whose values must be present in every current non-empty group.
     */
    attribute: AttributeIdentifier;
}

/**
 * Which categories belong to which group.
 */
export type CustomGroups = Record<string, Scalar[]>;

export interface GroupCustom extends PayloadWithAttribute {
    /**
     * Mapping from output group name to attribute values assigned to that group.
     *
     * Samples whose value is not listed in any group are omitted from the
     * grouped result.
     */
    groups: CustomGroups;
}
