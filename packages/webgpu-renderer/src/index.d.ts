export type MarkType = "rect" | "point";
export type MarkId = number & { __brand: "MarkId" };

export type TypedArray =
    | Float32Array
    | Float64Array
    | Int32Array
    | Uint32Array
    | Int16Array
    | Uint16Array
    | Int8Array
    | Uint8Array;

export type ChannelScale = {
    /** Which scale function to apply before mapping to range values. */
    type: "identity" | "linear";

    /** Domain for scale mapping, provided by the core module. */
    domain?: [number, number];

    /** Range for scale mapping, provided by the core module. */
    range?: [number, number];
};

export type ChannelConfigCommon = {
    /** Vector width when series data stores packed vectors (e.g., RGBA). */
    components?: 1 | 2 | 4;

    /** Default if no series data or value is supplied. */
    default?: number | number[];
};

/** Scale-capable channel config. Used by both input and resolved variants. */
export type ChannelConfigWithScale = ChannelConfigCommon & {
    /** Scale applied to raw (domain-space) values. */
    scale: ChannelScale;
};

/** Range-space config without scale. Used by both input and resolved variants. */
export type ChannelConfigWithoutScale = ChannelConfigCommon & {
    /** Range-space values; no scale transformation. */
    scale?: never;
};

/** Utility type for requiring specific keys when resolving configs. */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Input shape for series-backed channels; data/type may be supplied later. */
export type SeriesChannelConfigInput = {
    /** Columnar data for this channel when using series. */
    data?: TypedArray;

    /** Scalar element type for series data. */
    type?: "f32" | "u32" | "i32";

    /** Value is not used for series data. */
    value?: never;
};

/** Input shape for value-backed channels; value/type may be supplied later. */
export type ValueChannelConfigInput = {
    /** Uniform value in range space (used directly). */
    value?: number | number[];

    /** Scalar element type for value data. */
    type?: "f32" | "u32" | "i32";

    /** When true, value is provided via uniforms; otherwise emitted as WGSL constants. */
    dynamic?: boolean;

    /** Series data is not used for value channels. */
    data?: never;
};

/** User-supplied configs; may be partial because defaults are filled later. */
export type ChannelConfigWithScaleInput = (
    | SeriesChannelConfigInput
    | ValueChannelConfigInput
) &
    ChannelConfigWithScale;

/** User-supplied configs; may be partial because defaults are filled later. */
export type ChannelConfigWithoutScaleInput = (
    | SeriesChannelConfigInput
    | ValueChannelConfigInput
) &
    ChannelConfigWithoutScale;

/** Any user-facing channel config (may omit data/value until normalized). */
export type ChannelConfigInput =
    | ChannelConfigWithScaleInput
    | ChannelConfigWithoutScaleInput;

/** Helper aliases for guards that check input configs by source. */
export type SeriesChannelConfigWithScaleInput = SeriesChannelConfigInput &
    ChannelConfigWithScale;
export type SeriesChannelConfigWithoutScaleInput = SeriesChannelConfigInput &
    ChannelConfigWithoutScale;
export type ValueChannelConfigWithScaleInput = ValueChannelConfigInput &
    ChannelConfigWithScale;
export type ValueChannelConfigWithoutScaleInput = ValueChannelConfigInput &
    ChannelConfigWithoutScale;

/** Resolved series config after normalization (data/type required). */
export type SeriesChannelConfig = RequireKeys<
    SeriesChannelConfigInput,
    "data" | "type"
>;

/** Resolved value config after normalization (value required). */
export type ValueChannelConfig = RequireKeys<ValueChannelConfigInput, "value">;

export type SeriesChannelConfigWithScale = SeriesChannelConfig &
    ChannelConfigWithScale;
export type SeriesChannelConfigWithoutScale = SeriesChannelConfig &
    ChannelConfigWithoutScale;
export type ValueChannelConfigWithScale = ValueChannelConfig &
    ChannelConfigWithScale;
export type ValueChannelConfigWithoutScale = ValueChannelConfig &
    ChannelConfigWithoutScale;

/** Internal shape after normalization: every channel is series or value. */
export type ChannelConfigResolved =
    | SeriesChannelConfigWithScale
    | SeriesChannelConfigWithoutScale
    | ValueChannelConfigWithScale
    | ValueChannelConfigWithoutScale;

/** Public-facing channel config type (input form). */
export type ChannelConfig = ChannelConfigInput;

export type RectChannelName =
    keyof typeof import("./marks/rectProgram.js").RECT_CHANNEL_SPECS;

export type RectChannels = Partial<Record<RectChannelName, ChannelConfigInput>>;

export type PointChannelName =
    keyof typeof import("./marks/pointProgram.js").POINT_CHANNEL_SPECS;

export type PointChannels = Partial<
    Record<PointChannelName, ChannelConfigInput>
>;

export type MarkConfig<T extends MarkType = MarkType> = {
    channels: T extends "rect"
        ? RectChannels
        : T extends "point"
          ? PointChannels
          : Record<string, ChannelConfigInput>;

    /** Number of instances to draw; must match the column lengths. */
    count: number;
};

export type RendererOptions = {
    alphaMode?: GPUCanvasAlphaMode;
    format?: GPUTextureFormat;
};

export type GlobalUniforms = {
    width: number;
    height: number;
    dpr: number;
};

export class RendererError extends Error {}

export class Renderer {
    /** Update global viewport-related uniforms (pixel size + device pixel ratio). */
    updateGlobals(globals: GlobalUniforms): void;

    /** Create a new mark program and return its id. */
    createMark<T extends MarkType>(type: T, config: MarkConfig<T>): MarkId;

    /** Upload columnar series data (storage buffers) for a mark. */
    updateSeries(
        markId: MarkId,
        channels: Record<string, TypedArray>,
        count: number
    ): void;

    /**
     * Update value-based uniforms for a mark and optional scale domain/range.
     * Domain/range entries can be provided as `{ domain, range }` or `[min, max]`.
     */
    updateValues(
        markId: MarkId,
        values: Record<
            string,
            | number
            | number[]
            | [number, number]
            | { domain?: [number, number]; range?: [number, number] }
        >
    ): void;

    /** Draw the current frame. */
    render(): void;

    /** Destroy GPU resources associated with a mark. */
    destroyMark(markId: MarkId): void;
}

export function createRenderer(
    canvas: HTMLCanvasElement,
    options?: RendererOptions
): Promise<Renderer>;

export function isChannelConfigWithScale(
    config: ChannelConfigInput
): config is ChannelConfigWithScaleInput;

export function isChannelConfigWithoutScale(
    config: ChannelConfigInput
): config is ChannelConfigWithoutScaleInput;

export function isSeriesChannelConfig(
    config: ChannelConfigInput
): config is
    | SeriesChannelConfigWithScaleInput
    | SeriesChannelConfigWithoutScaleInput;

export function isValueChannelConfig(
    config: ChannelConfigInput
): config is
    | ValueChannelConfigWithScaleInput
    | ValueChannelConfigWithoutScaleInput;
