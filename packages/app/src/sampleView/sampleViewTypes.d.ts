import { SampleHierarchy } from "./state/sampleSlice.js";
import { Group } from "./state/sampleState.js";
import { LocSize } from "@genome-spy/core/view/layout/flexLayout.js";
import { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";
import { Scalar } from "@genome-spy/core/spec/channel.js";
import { AggregationSpec, Interval } from "./types.js";
import ViewContext from "@genome-spy/core/types/viewContext.js";

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

export interface LocusSpecifier {
    /** A uniuque name of the view */
    view: string;

    /** Attribute, e.g., the name of the field where a value is stored */
    field: string;

    /**
     * Coordinate on the `x` axis. May be a number of locus on a chromosome.
     * Alternatively, a scalar if a categorical scale is used.
     */
    locus: Scalar | ChromosomalLocus;
}

export interface IntervalSpecifier {
    /** A uniuque name of the view */
    view: string;

    /** Attribute, e.g., the name of the field where a value is stored */
    field: string;

    /** Interval on the x axis */
    interval: Interval;

    /** Aggregation operation to apply over the interval */
    aggregation: AggregationSpec;
}

export type ViewAttributeSpecifier = LocusSpecifier | IntervalSpecifier;

/**
 * @param {ViewAttributeSpecifier} specifier
 * @returns {specifier is IntervalSpecifier}
 */
export function isIntervalSpecifier(
    specifier: ViewAttributeSpecifier
): specifier is IntervalSpecifier;
