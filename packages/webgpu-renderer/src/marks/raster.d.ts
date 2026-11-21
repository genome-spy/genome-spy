import type {
    ChannelConfigInput,
    ChannelConfigWithScaleInput,
    MarkConfig,
    MarkDefinition,
    TypedArray,
} from "../index.js";

export type RasterConfig = Omit<MarkConfig, "channels"> & {
    count: number;
    channels: Record<string, ChannelConfigInput> & {
        fill: { scale: ChannelConfigWithScaleInput["scale"] };
    };
    /** Row-major values or category IDs addressed by tile offset. The array type determines the fill scale input type. */
    cells: Float32Array | Uint32Array;
};

export const rasterMark: MarkDefinition<
    RasterConfig,
    Record<string, TypedArray>,
    { cells: RasterConfig["cells"] }
>;
