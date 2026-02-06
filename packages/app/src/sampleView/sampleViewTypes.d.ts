import { SampleHierarchy } from "./state/sampleSlice.js";
import { Group } from "./state/sampleState.js";
import { LocSize } from "@genome-spy/core/view/layout/flexLayout.js";
import { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";
import { Scalar } from "@genome-spy/core/spec/channel.js";
import { ComplexDomain, NumericDomain } from "@genome-spy/core/spec/scale.js";
import { AggregationSpec, Interval } from "./types.js";
import ViewContext from "@genome-spy/core/types/viewContext.js";

/**
 * Structured view address used by selectors (import scope + view name).
 */
export type ViewSelector =
    import("@genome-spy/core/view/viewSelectors.js").ViewSelector;

export type ParamSelector =
    import("@genome-spy/core/view/viewSelectors.js").ParamSelector;

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

    /** Attribute, e.g., the name of the field where a value is stored */
    field: string;

    /** The x-scale domain that was visible when the action was triggered */
    domainAtActionTime?: NumericDomain | ComplexDomain;
}

export interface LocusSpecifier extends BaseSpecifier {
    /**
     * Coordinate on the `x` axis. May be a number of locus on a chromosome.
     * Alternatively, a scalar if a categorical scale is used.
     */
    locus: Scalar | ChromosomalLocus;
}

export interface SelectionIntervalSource {
    type: "selection";
    selector: ParamSelector;
}

export interface IntervalLiteralSpecifier extends BaseSpecifier {
    /** Interval on the x axis */
    interval: Interval;

    /** Aggregation operation to apply over the interval */
    aggregation: AggregationSpec;

    intervalSource?: never;
}

export interface IntervalSourceSpecifier extends BaseSpecifier {
    /** A dynamic interval source resolved at action execution time */
    intervalSource: SelectionIntervalSource;

    /** Aggregation operation to apply over the interval */
    aggregation: AggregationSpec;

    interval?: never;
}

export type IntervalSpecifier =
    | IntervalLiteralSpecifier
    | IntervalSourceSpecifier;

export type ViewAttributeSpecifier = LocusSpecifier | IntervalSpecifier;

/**
 * @param {ViewAttributeSpecifier} specifier
 * @returns {specifier is IntervalSpecifier}
 */
export function isIntervalSpecifier(
    specifier: ViewAttributeSpecifier
): specifier is IntervalSpecifier;

export function hasLiteralInterval(
    specifier:
        | ViewAttributeSpecifier
        | { interval: Interval }
        | { intervalSource: SelectionIntervalSource }
): specifier is IntervalLiteralSpecifier | { interval: Interval };

export function hasIntervalSource(
    specifier:
        | ViewAttributeSpecifier
        | { interval: Interval }
        | { intervalSource: SelectionIntervalSource }
): specifier is
    | IntervalSourceSpecifier
    | { intervalSource: SelectionIntervalSource };
