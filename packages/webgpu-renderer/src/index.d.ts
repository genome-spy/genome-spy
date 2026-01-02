export type MarkType = "rect" | "point" | "rule";
export type MarkId = number & { __brand: "MarkId" };

export type ScalarType = "f32" | "u32" | "i32";

export type ColorInterpolatorFn = (t: number) => string;
export type ColorInterpolatorFactory = (
    a: string,
    b: string
) => ColorInterpolatorFn;

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
    type:
        | "identity"
        | "linear"
        | "log"
        | "pow"
        | "sqrt"
        | "symlog"
        | "band"
        | "index"
        | "threshold"
        | "ordinal";

    /** Domain for scale mapping; band/ordinal domains list category IDs. */
    domain?: number[];

    /** Range for scale mapping or a sequential interpolator (0..1 -> CSS color). */
    range?: Array<number | number[] | string> | ColorInterpolatorFn;

    /**
     * Interpolation factory for color ranges; only used for vec4 color ranges.
     * Accepts d3-interpolate factories (e.g., interpolateHcl or
     * interpolateRgb.gamma(2.2)) and other compatible interpolators.
     */
    interpolate?: ColorInterpolatorFactory;

    /** Base for log scales. */
    base?: number;

    /** Exponent for pow scales (sqrt uses 0.5). */
    exponent?: number;

    /** Constant for symlog scales. */
    constant?: number;

    /** Clamp values to the domain/range for continuous scales. */
    clamp?: boolean;

    /** Round continuous scale outputs to the nearest integer (scalar outputs only). */
    round?: boolean;

    /** Inner padding for band scales. */
    paddingInner?: number;

    /** Outer padding for band scales. */
    paddingOuter?: number;

    /** Alignment for band scales. */
    align?: number;

    /** Band position within the step (0..1). */
    band?: number;
};

export type ChannelConfigCommon = {
    /** Vector width when series data stores packed vectors (e.g., RGBA). */
    components?: 1 | 2 | 4;

    /** Vector width of series data when it differs from the output components. */
    inputComponents?: 1 | 2 | 4;

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
    type?: ScalarType;

    /** Value is not used for series data. */
    value?: never;
};

/** Input shape for value-backed channels; value/type may be supplied later. */
export type ValueChannelConfigInput = {
    /** Uniform value in range space (used directly). */
    value?: number | number[];

    /** Scalar element type for value data. */
    type?: ScalarType;

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
    keyof typeof import("./marks/programs/rectProgram.js").RECT_CHANNEL_SPECS;

export type RectChannels = Partial<Record<RectChannelName, ChannelConfigInput>>;

export type PointChannelName =
    keyof typeof import("./marks/programs/pointProgram.js").POINT_CHANNEL_SPECS;

export type PointChannels = Partial<
    Record<PointChannelName, ChannelConfigInput>
>;

export type RuleChannelName =
    keyof typeof import("./marks/programs/ruleProgram.js").RULE_CHANNEL_SPECS;

export type RuleChannels = Partial<Record<RuleChannelName, ChannelConfigInput>>;

export type MarkConfig<T extends MarkType = MarkType> = {
    channels: T extends "rect"
        ? RectChannels
        : T extends "point"
          ? PointChannels
          : T extends "rule"
            ? RuleChannels
            : Record<string, ChannelConfigInput>;

    /**
     * Number of instances to draw. If omitted, the count is inferred from
     * series buffer lengths when possible.
     */
    count?: number;
} & (T extends "rule"
    ? {
          /**
           * Dash patterns for rule marks. Each pattern is an even-length array
           * of segment lengths expressed in stroke-width units.
           */
          dashPatterns?: number[][];
      }
    : Record<string, never>);

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

    /**
     * Upload columnar series data (storage buffers) for a mark.
     *
     * If multiple channels share the same `TypedArray` at mark creation, the
     * renderer treats them as a shared buffer. Updates must keep those channels
     * shared by providing the same array instance for the group.
     *
     * The count defaults to the inferred series length when omitted. If the mark
     * has no series channels, the count remains unchanged (or defaults to 1 only
     * when the mark was created without series data and without an explicit count).
     */
    updateSeries(
        markId: MarkId,
        channels: Record<string, TypedArray>,
        count?: number
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
            | { domain?: number[]; range?: Array<number | number[] | string> }
        >
    ): void;

    /** Update scale domain values by channel or scale name. */
    updateScaleDomains(markId: MarkId, domains: Record<string, number[]>): void;

    /** Update scale range values by channel or scale name. */
    updateScaleRanges(
        markId: MarkId,
        ranges: Record<string, Array<number | number[] | string>>
    ): void;

    /** Log the GPU resources reserved by a mark to the console. */
    debugResources(markId: MarkId, label?: string): void;

    /** Draw the current frame. */
    render(): void;

    /** Destroy GPU resources associated with a mark. */
    destroyMark(markId: MarkId): void;
}

export function createRenderer(
    canvas: HTMLCanvasElement,
    options?: RendererOptions
): Promise<Renderer>;

/** Enable or disable renderer resource debug logging. */
export function setDebugResourcesEnabled(enabled: boolean): void;

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
