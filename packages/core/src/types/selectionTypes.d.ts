import { ChannelWithScale, Scalar } from "../spec/channel.js";

export interface SelectionBase {
    type: string;
}

export interface RangeSelection extends SelectionBase {
    type: "range";

    fields?: string[];
    channels?: ChannelWithScale[];

    ranges: number[][];
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

    data: Datum[];
    uniqueIds: Set<number>;
}

export type Selection =
    | RangeSelection
    | ProjectedSelection
    | SinglePointSelection
    | MultiPointSelection;
