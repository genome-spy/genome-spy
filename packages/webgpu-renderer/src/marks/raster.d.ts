import type {
    ChannelConfigInput,
    ChannelConfigWithScaleInput,
    MarkConfig,
    MarkDefinition,
    SelectionPredicateLeaf,
    TypedArray,
} from "../index.js";

type RasterCellOpacityValue = {
    value: number;
    dynamic?: boolean;
    data?: never;
    scale?: never;
};

type RasterCellOpacityCondition = {
    when: Extract<SelectionPredicateLeaf, { type: "interval" }> & {
        projections: readonly [
            {
                component: string;
                input: "fill";
                secondaryInput?: never;
            },
        ];
    };
} & (
    | { value: number; channel?: never }
    | { channel: RasterCellOpacityValue; value?: never }
);

export type RasterConfig = Omit<MarkConfig, "channels"> & {
    count: number;
    channels: Record<string, ChannelConfigInput> & {
        fill: { scale: ChannelConfigWithScaleInput["scale"] };
        /** Scalar opacity with an optional interval on the raw float32 cell value. */
        cellOpacity?: RasterCellOpacityValue & {
            conditions?: [RasterCellOpacityCondition];
        };
    };
    /** Row-major values or category IDs addressed by tile offset. The array type determines the fill scale input type. */
    cells: Float32Array | Uint32Array;
};

export const rasterMark: MarkDefinition<
    RasterConfig,
    Record<string, TypedArray>,
    { cells: RasterConfig["cells"] }
>;
