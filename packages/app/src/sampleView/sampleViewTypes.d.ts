import { SampleHierarchy } from "./state/sampleSlice.js";
import { Group } from "./state/sampleState.js";
import { LocSize } from "@genome-spy/core/view/layout/flexLayout.js";
import { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";
import { Scalar } from "@genome-spy/core/spec/channel.js";
import { ComplexDomain, NumericDomain } from "@genome-spy/core/spec/scale.js";
import { AggregationSpec, Interval } from "./types.js";
import ViewContext from "@genome-spy/core/types/viewContext.js";
import type {
    ParamSelector,
    ViewSelector,
} from "@genome-spy/core/view/viewUtilTypes.d.ts";
export type { ParamSelector, ViewSelector };

/**
 * View reference used in SampleView actions. Legacy values may be a view name
 * string, but selectors are the unambiguous, bookmark-friendly form.
 */
export type ViewRef = string | ViewSelector;

export interface KeyAndLocation<T> {
    key: T;
    locSize: LocSize;
}

export type GroupLocation = KeyAndLocation<Group[]>;
export type SampleLocation = KeyAndLocation<string>;

export interface GroupDetails {
    index: number;
    group: Group;
    depth: number;
    n: number;
}

export type HierarchicalGroupLocation = KeyAndLocation<GroupDetails>;

export type InterpolatedLocationMaker = <K, T extends KeyAndLocation<K>>(
    fitted: T[],
    scrollable: T[]
) => T[];

export interface Locations {
    groups: HierarchicalGroupLocation[];
    samples: SampleLocation[];
    summaries: GroupLocation[];
}

export interface LocationContext {
    getSampleHierarchy: () => SampleHierarchy;
    getHeight: () => number;
    getSummaryHeight: () => number;
    onLocationUpdate: (arg: { sampleHeight: number }) => void;
    viewContext: ViewContext;
    isStickySummaries: () => boolean;
}

export interface BaseSpecifier {
    /**
     * A unique view reference. Legacy values may be a view name string.
     */
    view: ViewRef;

    /**
     * Attribute or field name used by the specifier.
     */
    field: string;

    /**
     * The x-scale domain that was visible when the action was triggered.
     */
    domainAtActionTime?: NumericDomain | ComplexDomain;
}

/**
 * Specifier that points to a single locus or scalar coordinate.
 */
export interface LocusSpecifier extends BaseSpecifier {
    /**
     * Coordinate on the `x` axis. May be a number of locus on a chromosome.
     * Alternatively, a scalar if a categorical scale is used.
     */
    locus: Scalar | ChromosomalLocus;
}

/**
 * Interval that will be resolved from a selection parameter.
 */
export interface SelectionIntervalSource {
    type: "selection";
    selector: ParamSelector;
}

/**
 * Literal interval or selection-backed interval reference.
 */
export type IntervalReference = Interval | SelectionIntervalSource;

/**
 * Interval plus the container key used by some helper functions.
 */
export type IntervalCarrier = { interval: IntervalReference };

/**
 * Specifier that summarizes a field over an interval.
 */
export interface IntervalSpecifier extends BaseSpecifier {
    /** Literal interval or a selection source resolved at action execution time */
    interval: IntervalReference;

    /** Aggregation operation to apply over the interval */
    aggregation: AggregationSpec;
}

/**
 * Supported view-backed attribute specifiers used by the sample collection
 * actions.
 */
export type ViewAttributeSpecifier = LocusSpecifier | IntervalSpecifier;

/**
 * @param {ViewAttributeSpecifier} specifier
 * @returns {specifier is IntervalSpecifier}
 */
export function isIntervalSpecifier(
    specifier: ViewAttributeSpecifier
): specifier is IntervalSpecifier;

export function isLiteralInterval(
    interval: IntervalReference
): interval is Interval;

export function isIntervalSource(
    interval: IntervalReference
): interval is SelectionIntervalSource;
