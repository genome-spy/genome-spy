import { Datum } from "../data/flowNode.js";
import { ViewSelector } from "../view/viewUtilTypes.js";
import {
    ChannelWithScale,
    PositionalChannel,
    Scalar,
} from "../spec/channel.js";

export interface SelectionBase {
    type: string;
}

export interface IntervalSelection extends SelectionBase {
    type: "interval";

    intervals: Partial<Record<PositionalChannel, number[] | null>>;
}

export interface ProjectedSelection extends SelectionBase {
    type: "projected";

    fields?: string[];
    channels?: ChannelWithScale[];

    values: Scalar[][];
}

export interface SinglePointSelection extends SelectionBase {
    type: "single";

    datum: Datum;
    uniqueId: number;
}

export interface MultiPointSelection extends SelectionBase {
    type: "multi";

    /** Maps unique id to datum */
    data: Map<number, Datum>;
}

/** Resolved numeric mapping captured when a lasso is drawn. */
export interface RegionScaleMapping {
    type: "linear" | "log" | "sqrt" | "pow" | "symlog";
    domain: number[];
    range: number[];
    clamp: boolean;
    base?: number;
    exponent?: number;
    constant?: number;
}

/** The geometric query, independent of runtime point IDs and scale navigation. */
export interface RegionSelectionIntent {
    /** Vertices in the normalized coordinate space of the captured mappings. */
    polygon: ReadonlyArray<readonly [number, number]>;

    fields: { x: string; y: string };

    scales: { x: RegionScaleMapping; y: RegionScaleMapping };

    producer: ViewSelector;
}

/** Pending and zero-match polygons remain active; only cleared intent is empty. */
export type RegionSelection = SelectionBase & {
    type: "region";
    data: Map<number, Datum>;
} & (
        | { status: "cleared"; intent: null }
        | { status: "pending" | "ready"; intent: RegionSelectionIntent }
    );

export type Selection =
    | IntervalSelection
    | ProjectedSelection
    | SinglePointSelection
    | MultiPointSelection
    | RegionSelection;
