import { Datum } from "../data/flowNode.js";
import { PositionalChannel, Scalar } from "../spec/channel.js";
import { CategorySelectionChannel } from "../spec/parameter.js";

export interface SelectionBase {
    type: string;
}

export interface IntervalSelection extends SelectionBase {
    type: "interval";

    intervals: Partial<Record<PositionalChannel, number[] | null>>;
}

export interface CategoryPointSelection extends SelectionBase {
    type: "categories";

    component: CategorySelectionChannel;

    values: Set<Scalar>;
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
    | CategoryPointSelection
    | SinglePointSelection
    | MultiPointSelection;
