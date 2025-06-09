import { Datum } from "../data/flowNode.js";
import { ChannelWithScale, Scalar } from "../spec/channel.js";

export interface SelectionBase {
    type: string;
}

export interface IntervalSelection extends SelectionBase {
    type: "interval";

    intervals: Partial<Record<ChannelWithScale, number[] | null>>;
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

export type Selection =
    | IntervalSelection
    | ProjectedSelection
    | SinglePointSelection
    | MultiPointSelection;
