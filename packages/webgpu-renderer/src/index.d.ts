export type MarkType = "rect" | "point" | "rule" | "link" | "text";
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

/** Input typing rules used by channel validation and scale metadata. */
export type ScaleInputRule = "any" | "numeric" | "u32";

/** Output typing rules used by channel validation and scale metadata. */
export type ScaleOutputRule = "same" | "f32";

/** Stop-array categories used by scale resource planning. */
export type ScaleStopKind = "continuous" | "threshold" | "piecewise";

/** Resource rules used by the renderer to allocate scale buffers/textures. */
export type ScaleResourceRules = {
    /**
     * Base domain/range kind for uniform-backed domain/range arrays.
     * Use null when the scale has no uniform domain/range (e.g., ordinal uses
     * domain map + range buffers instead).
     */
    stopKind: ScaleStopKind | null;

    /** True when piecewise variants can be produced from this scale. */
    supportsPiecewise?: boolean;

    /** True when the scale needs a domain-to-index hash map buffer. */
    needsDomainMap?: boolean;

    /** True when the scale needs an ordinal range buffer. */
    needsOrdinalRange?: boolean;
};

/** Resolved resource requirements for a scale + channel pair. */
export type ScaleResourceRequirements = {
    stopKind: ScaleStopKind | null;
    needsDomainMap: boolean;
    needsOrdinalRange: boolean;
};

/** Uniform metadata for scale-specific parameters (base, exponent, padding). */
export type ScaleUniformParam = {
    prefix: string;
    defaultValue: number;
    prop?:
        | "base"
        | "exponent"
        | "constant"
        | "paddingInner"
        | "paddingOuter"
        | "align"
        | "band";
};

/** Uniform definition bundle for a scale. */
export type ScaleUniformDef = {
    stopArrays: boolean;
    params: ScaleUniformParam[];
};

/** Parameters passed to scale-specific WGSL emitter functions. */
export type ScaleEmitParams = {
    /** Channel name used for function naming and uniform lookups. */
    name: string;

    /** Scale config for custom emitters that need direct access. */
    scaleConfig?: ChannelScale;

    /** WGSL expression for the raw value (buffer read or literal/uniform). */
    rawValueExpr: string;

    /** Scalar type of the raw input when inputComponents is 1. */
    inputScalarType: ScalarType;

    /** Vector width of the raw input value. */
    inputComponents: 1 | 2 | 4;

    /** Vector width expected by the mark shader for the scaled output. */
    outputComponents: 1 | 2 | 4;

    /** Scalar type of the scaled output when outputComponents is 1. */
    outputScalarType: ScalarType;

    /** True when inputs should be clamped to the domain extent. */
    clamp: boolean;

    /** True when scalar outputs should be rounded. */
    round: boolean;

    /** Domain length for scales that use fixed-size arrays. */
    domainLength: number;

    /** Range length for scales that use fixed-size arrays. */
    rangeLength: number;

    /** True when the scale is in piecewise mode. */
    isPiecewise: boolean;

    /** Name of the domain-map buffer for sparse ordinal domains (if any). */
    domainMapName?: string | null;

    /** True when the output is read from a ramp texture. */
    useRangeTexture?: boolean;
};

/** Common parameter subset for continuous scale emitters. */
export type ContinuousEmitParams = Pick<
    ScaleEmitParams,
    | "name"
    | "rawValueExpr"
    | "inputScalarType"
    | "clamp"
    | "round"
    | "useRangeTexture"
>;

/** Mutable state used by scale pipeline steps. */
export type ScalePipelineState = {
    expr: string;
    body: string;
};

/** Pipeline step that transforms the current expression and emitted WGSL. */
export type ScalePipelineStep = (
    state: ScalePipelineState
) => ScalePipelineState;

/** Parameters for the pipeline-based WGSL emitter. */
export type ScalePipeline = {
    name: string;
    rawValueExpr: string;
    steps: ScalePipelineStep[];
    returnType: string;
    useRangeTexture?: boolean;
};

/** Scale-specific WGSL emitter for `getScaled_*` helpers. */
export type ScaleEmitter = (params: ScaleEmitParams) => string;

/**
 * Context passed to scale-specific validation helpers.
 * This mirrors the channel analysis used by the shader builder.
 */
export type ScaleValidationContext = {
    name: string;
    channel: ChannelConfigInput;
    scaleType: ChannelScale["type"];
    outputComponents: 1 | 2 | 4;
    inputComponents: 1 | 2 | 4;
    inputScalarType: ScalarType;
    outputScalarType: ScalarType;
    isPiecewise: boolean;
    needsDomainMap: boolean;
    allowsScalarToVector: boolean;
    isContinuousScale: boolean;
    rangeIsFunction: boolean;
    rangeIsColor: boolean;
};

/** Scale-specific validation result (null means OK). */
export type ScaleValidationResult = string | null;

/**
 * Scale definition contract. This combines metadata, resource requirements,
 * and the WGSL emitter used for scale-specific shader code.
 */
export type ScaleDef = {
    input: ScaleInputRule;
    output: ScaleOutputRule;
    /** Extra uniforms required by the scale (e.g. base, exponent, padding). */
    params: ScaleUniformParam[];
    /**
     * Continuous scales map numeric inputs to numeric outputs and support clamping
     * and interpolated ranges (linear/log/pow/sqrt/symlog).
     */
    continuous: boolean;

    /** Resource hints used for allocating buffers and textures. */
    resources: ScaleResourceRules;

    /**
     * Vector output policy for the scale. "interpolated" allows vector outputs
     * only when using interpolated/color ranges.
     */
    vectorOutput?: "never" | "interpolated" | "always";

    /**
     * Optional WGSL snippet implementing the scale helpers (scaleLinear, etc).
     * This is stitched into the global shader prelude with dependencies.
     */
    wgsl?: string;

    /**
     * Optional list of scale names whose WGSL must be emitted before this scale.
     */
    wgslDeps?: string[];

    /** Optional scale-specific validation hook. */
    validate?: (context: ScaleValidationContext) => ScaleValidationResult;

    /** WGSL emitter that produces the scale function for this definition. */
    emit: ScaleEmitter;
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

export type LinkChannelName =
    keyof typeof import("./marks/programs/linkProgram.js").LINK_CHANNEL_SPECS;

export type LinkChannels = Partial<Record<LinkChannelName, ChannelConfigInput>>;

export type TextChannelName =
    | "uniqueId"
    | "x"
    | "x2"
    | "y"
    | "y2"
    | "text"
    | "size"
    | "angle"
    | "dx"
    | "dy"
    | "align"
    | "baseline"
    | "fill"
    | "opacity";

export type TextStringChannelConfigInput =
    | (Omit<SeriesChannelConfigInput, "data" | "type"> & {
          data: string[];
          type?: "u32";
      })
    | (Omit<ValueChannelConfigInput, "value" | "type"> & {
          value: string;
          type?: "u32";
      });

export type TextChannels = Omit<
    Partial<Record<TextChannelName, ChannelConfigInput>>,
    "text"
> & { text?: ChannelConfigInput | TextStringChannelConfigInput };

export type TextLayout = {
    glyphIds: Uint32Array;
    stringIndex: Uint32Array;
    xOffset: Float32Array;
    yOffset?: Float32Array | null;
    textWidth: Float32Array;
    textHeight: Float32Array;
    fontSize: number;
    lineAdvance: number;
    ascent: number;
    descent: number;
};

export type TextMarkOptions = {
    textLayout?: TextLayout;
    font?: string;
    fontStyle?: "normal" | "italic";
    fontWeight?: number | string;
    fontSize?: number;
    lineHeight?: number;
    letterSpacing?: number;
    paddingX?: number;
    paddingY?: number;
    flushX?: boolean;
    flushY?: boolean;
    squeeze?: boolean;
};

export type LinkShape = "arc" | "dome" | "diagonal" | "line";

export type LinkOrient = "vertical" | "horizontal";

export type LinkMarkOptions = {
    /** Number of curve segments used for tessellation. */
    segments?: number;

    /** Curve shape: arc, dome, diagonal, or straight line. */
    linkShape?: LinkShape;

    /** Orientation for dome/diagonal shapes. */
    orient?: LinkOrient;

    /** Height multiplier for arc shape. */
    arcHeightFactor?: number;

    /** Minimum arc height in pixels. */
    minArcHeight?: number;

    /** Clamp very long arcs to keep endpoint precision stable when zoomed in (pixels). */
    maxChordLength?: number;

    /** Clamp arc apex to viewport bounds. */
    clampApex?: boolean;

    /** Fade arcs by distance from the chord line. */
    arcFadingDistance?: [number, number];
};

export type MarkConfig<T extends MarkType = MarkType> = {
    channels: T extends "rect"
        ? RectChannels
        : T extends "point"
          ? PointChannels
          : T extends "rule"
            ? RuleChannels
            : T extends "link"
              ? LinkChannels
              : T extends "text"
                ? TextChannels
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
    : Record<string, never>) &
    (T extends "link" ? LinkMarkOptions : Record<string, never>) &
    (T extends "text" ? TextMarkOptions : Record<string, never>);

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

/** Register a custom scale definition in the renderer registry. */
export function registerScaleDef(name: string, def: ScaleDef): void;

/** Build the WGSL function header for a channel's getScaled helper. */
export function makeFnHeader(name: string, returnType: string): string;

/** Resolve the packed domain uniform to a vec2 expression. */
export function domainVec2(name: string): string;

/** Resolve the packed domain uniform to a vec3 expression. */
export function domainVec3(name: string): string;

/** Resolve the packed range uniform to a vec2 expression. */
export function rangeVec2(name: string): string;

/** Emit a WGSL expression that coerces raw values to u32. */
export function toU32Expr(
    rawValueExpr: string,
    inputScalarType: ScalarType
): string;

/** Emit WGSL for a continuous scale helper with optional clamp/round logic. */
export function emitContinuousScale(
    params: ContinuousEmitParams,
    valueExprFn: (params: { name: string; valueExpr: string }) => string
): string;

/** Emit WGSL for a scale pipeline built from reusable steps. */
export function emitScalePipeline(pipeline: ScalePipeline): string;

/** Pipeline step: cast raw input to f32. */
export function castToF32Step(inputScalarType: ScalarType): ScalePipelineStep;

/** Pipeline step: clamp to a domain expression. */
export function clampToDomainStep(domainExpr: string): ScalePipelineStep;

/** Pipeline step: apply a scale function. */
export function applyScaleStep(
    name: string,
    valueExprFn: (params: { name: string; valueExpr: string }) => string
): ScalePipelineStep;

/** Pipeline step: round away from zero (d3 rangeRound). */
export function roundStep(): ScalePipelineStep;

/** Pipeline step: apply piecewise linear interpolation. */
export function piecewiseLinearStep(params: {
    name: string;
    domainLength: number;
    outputComponents: 1 | 2 | 4;
    outputScalarType: ScalarType;
    useRangeTexture?: boolean;
}): ScalePipelineStep;

/** Pipeline step: apply threshold scale mapping. */
export function thresholdStep(params: {
    name: string;
    domainLength: number;
    outputComponents: 1 | 2 | 4;
    outputScalarType: ScalarType;
}): ScalePipelineStep;

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
