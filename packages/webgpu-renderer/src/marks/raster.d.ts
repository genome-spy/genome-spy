import type {
    ChannelConfigInput,
    MarkConfig,
    MarkDefinition,
    TypedArray,
} from "../index.js";

export type RasterConfig = Omit<MarkConfig, "channels"> & {
    count: number;
    channels: Record<string, ChannelConfigInput>;
    /** Contiguous row-major numeric cells addressed by tile offset. */
    cells: Float32Array;
};

export const rasterMark: MarkDefinition<
    RasterConfig,
    Record<string, TypedArray>,
    { cells: Float32Array }
>;
