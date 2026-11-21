import type {
    ChannelConfigInput,
    ChannelConfigWithScaleInput,
    MarkConfig,
    MarkDefinition,
    TypedArray,
} from "../index.js";

type CellOpacity = readonly [
    lower: number,
    upper: number,
    inside: number,
    outside: number,
];

export type RasterConfig = Omit<MarkConfig, "channels"> & {
    count: number;
    channels: Record<string, ChannelConfigInput> & {
        fill: { scale: ChannelConfigWithScaleInput["scale"] };
    };
    /** Row-major values or category IDs addressed by tile offset. The array type determines the fill scale input type. */
    cells: Float32Array | Uint32Array;
    /** Opacity inside and outside a half-open interval of raw numeric cell values. */
    cellOpacity?: CellOpacity;
};

export const rasterMark: MarkDefinition<
    RasterConfig,
    Record<string, TypedArray>,
    { cells: RasterConfig["cells"]; cellOpacity: CellOpacity }
>;
