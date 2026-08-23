/// <reference types="@webgpu/types" />

export type MarkType = "rect" | "point" | "rule" | "link" | "arrow" | "text";
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

export type SelectionType = "single" | "multi" | "interval";

export type IntervalSelectionTarget = Readonly<{
    /** Primary scalar input tested by this interval dimension. */
    input: string;
    /** Optional second endpoint of the same ranged datum. */
    secondaryInput?: string;
    /** Hit-test mode for ranged data; omitted means intersects. */
    hitTest?: "intersects" | "encloses" | "endpoints";
}>;

export type SelectionPredicate =
    | {
          /** Selection name declared in channel conditions. */
          selection: string;
          /** Fixed selection kind (cannot change after mark creation). */
          type: "single" | "multi";
          /** Treat empty selections as true when set. */
          empty?: boolean;
      }
    | {
          /** Selection name declared in channel conditions. */
          selection: string;
          /** Fixed selection kind (cannot change after mark creation). */
          type: "interval";
          /** Ordered, non-empty scalar target descriptors. */
          targets: readonly IntervalSelectionTarget[];
          /** Treat inactive targets as matching when set. */
          empty?: boolean;
      };

/** A non-visual, per-instance scalar series available to visibility predicates. */
export type ScalarInputConfig = Readonly<{
    /** Per-instance values in mark-series order. */
    data: TypedArray;
    /** WGSL scalar type used to pack and read the values. */
    type: ScalarType;
}>;

/** A retained scalar uniform whose value may change without recompilation. */
export type ScalarSlotConfig = Readonly<{
    /** Initial uniform value, including IEEE infinities but excluding NaN. */
    value: number;
    /** WGSL scalar type of the retained uniform. */
    type: ScalarType;
}>;

/** A scalar value read by an ordered visibility comparison. */
export type ScalarOperand =
    /** Raw input of an existing visual channel, before its scale. */
    | { channel: string }
    /** Per-instance series declared in MarkConfig.inputs. */
    | { input: string }
    /** Retained uniform declared in MarkConfig.scalarSlots. */
    | { slot: string };

/** An ordered comparison between two scalar operands of the same type. */
export type ScalarComparisonPredicate = Readonly<{
    /** Ordered comparison operator emitted into WGSL. */
    compare: "<" | "<=" | ">" | ">=";
    /** Value on the left side of the ordered comparison. */
    left: ScalarOperand;
    /** Value on the right side of the ordered comparison. */
    right: ScalarOperand;
}>;

/** An immutable selection, comparison, or Boolean visibility expression. */
export type VisibilityPredicate =
    /** Existing named selection test. */
    | SelectionPredicate
    /** Ordered scalar comparison. */
    | ScalarComparisonPredicate
    /** Logical AND over a non-empty child array. */
    | Readonly<{ all: readonly VisibilityPredicate[] }>
    /** Logical OR over a non-empty child array. */
    | Readonly<{ any: readonly VisibilityPredicate[] }>;

/** Updates one declared scalar slot without recreating renderer resources. */
export type ScalarSlotHandle = {
    /** Set the slot value using its declared scalar type. */
    set(value: number): void;
};

export type ChannelCondition =
    | {
          /** Selection predicate that guards the conditional branch. */
          when: SelectionPredicate;
          /** Range-space value to use when the predicate passes. */
          value: number | number[];
          /** Conditional channel config is not used for literal values. */
          channel?: never;
          /**
           * @internal Resolved conditional channel alias.
           * Conditional channels are normalized into synthetic channels (e.g.,
           * `fill__cond0`) used only inside the renderer.
           */
          channelName?: string;
      }
    | {
          /** Selection predicate that guards the conditional branch. */
          when: SelectionPredicate;
          /**
           * Channel config to evaluate when the predicate passes. This allows
           * conditional series + scale evaluation (Vega-Lite-style).
           */
          channel: ConditionalChannelConfigInput;
          /** Literal value is not used when a conditional channel is supplied. */
          value?: never;
          /**
           * @internal Resolved conditional channel alias.
           * Conditional channels are normalized into synthetic channels (e.g.,
           * `fill__cond0`) used only inside the renderer.
           */
          channelName?: string;
      };

export type ScaleSlotHandle = {
    /** Update the scale domain; shape changes require mark recreation. */
    setDomain(domain: number[]): void;
    /** Update the scale range or interpolator; shape changes require mark recreation. */
    setRange(
        range: Array<number | number[] | string> | ColorInterpolatorFn
    ): void;
};

export type ValueSlotHandle = {
    /** Update a dynamic value (uniform-backed). */
    set(value: number | number[]): void;
};

export type DynamicValueConfig = {
    /** Initial value for the existing extra uniform. */
    value: number | number[];
};

export type SelectionSlotHandle =
    | {
          type: "single";
          set(id: number): void;
      }
    | {
          type: "multi";
          set(ids: Uint32Array): void;
      }
    | {
          type: "interval";
          /** Stable target declaration order. */
          targets: readonly string[];
          /** Replace the complete interval state; omitted keys are inactive. */
          set(
              intervals: Readonly<
                  Partial<Record<string, readonly [number, number] | null>>
              >
          ): void;
      };

export type ChannelSlotGroup<T> = Partial<T> & {
    /**
     * Default slot for the channel, when present. Convenience methods like
     * `setDomain`, `setRange`, or `set` forward to this slot.
     */
    default?: T;
    /** Conditional slots keyed by selection name. */
    conditions?: Record<string, T>;
};

export type SeriesData = TypedArray | string | string[];

export type SeriesSlotHandle<
    TSeries extends Record<string, SeriesData> = Record<string, SeriesData>,
> = {
    /**
     * Replace every series-backed logical channel configured on the mark.
     * Mark definitions may preprocess logical inputs before uploading them.
     */
    replace(series: TSeries, count?: number): void;
};

export type MarkHandle<
    TSeries extends Record<string, SeriesData> = Record<string, SeriesData>,
> = {
    markId: MarkId;
    series: SeriesSlotHandle<TSeries>;
    scales: Record<string, ChannelSlotGroup<ScaleSlotHandle>>;
    values: Record<string, ChannelSlotGroup<ValueSlotHandle>>;
    extraValues: Record<string, ValueSlotHandle>;
    scalarSlots: Record<string, ScalarSlotHandle>;
    selections: Record<string, SelectionSlotHandle>;
};

export type BuiltInScaleType =
    | "identity"
    | "linear"
    | "log"
    | "pow"
    | "sqrt"
    | "symlog"
    | "quantize"
    | "band"
    | "index"
    | "threshold"
    | "ordinal";

export type ChannelScale = {
    /** Imported implementation used by shader generation and resource planning. */
    definition?: ScaleDef;

    /** Which scale function to apply before mapping to range values. */
    type: string;

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

export type DefinedChannelScale = ChannelScale & {
    definition: ScaleDef;
};

export type ConfiguredScale<T extends string> = DefinedChannelScale & {
    type: T;
};

export type ScaleOptions = Omit<ChannelScale, "type" | "definition">;

export type LinearScaleOptions = Pick<
    ChannelScale,
    "domain" | "range" | "interpolate" | "clamp" | "round"
>;

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

    /** Override for the generated function name (defaults to name). */
    functionName?: string;

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
    | "functionName"
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
    functionName?: string;
    rawValueExpr: string;
    steps: ScalePipelineStep[];
    returnType: string;
    useRangeTexture?: boolean;
};

/** Scale-specific WGSL emitter for `getScaled_*` helpers. */
export type ScaleEmitter = (params: ScaleEmitParams) => string;

/**
 * Shared scale IO contract used by validation, analysis, and codegen.
 */
export type ScaleIOContext = {
    /** Channel name used for diagnostics and uniform lookups. */
    name: string;
    /** Vector width of the raw input value before scaling. */
    inputComponents: 1 | 2 | 4;
    /** Vector width expected by the mark shader after scaling. */
    outputComponents: 1 | 2 | 4;
    /** Scalar type of the raw input when inputComponents is 1. */
    scalarType: ScalarType;
    /** Scalar type of the scaled output when outputComponents is 1. */
    outputScalarType: ScalarType;
};

/**
 * Parameters for `getScaled_*` WGSL emission.
 */
export type ScaleFunctionParams = ScaleIOContext & {
    /** Imported behavior that emits the scale's WGSL helper. */
    scaleDef: ScaleDef;
    /** Override for the generated function name (defaults to name). */
    functionName?: string;
    /** WGSL expression for the raw value (buffer read or literal/uniform). */
    rawValueExpr: string;
    /** Full scale config for detecting piecewise scales and clamp behavior. */
    scaleConfig?: ChannelScale;
    /** Storage buffer identifier for ordinal/band domain lookup, if used. */
    domainMapName?: string | null;
    /** Whether to map scale output through a color ramp texture. */
    useRangeTexture?: boolean;
};

/**
 * Context passed to scale-specific validation helpers.
 * This mirrors the channel analysis used by the shader builder.
 */
export type ScaleValidationContext = ScaleIOContext & {
    channel: ChannelConfigInput;
    scaleType: ChannelScale["type"];
    isPiecewise: boolean;
    needsDomainMap: boolean;
    allowsScalarToVector: boolean;
    isContinuousScale: boolean;
    rangeIsFunction: boolean;
    rangeIsColor: boolean;
};

/** Scale-specific validation result (null means OK). */
export type ScaleValidationResult = string | null;

/** Stop-array lengths for uniform-backed scales. */
export type ScaleStopLengths = {
    domainLength: number;
    rangeLength: number;
};

/** Parameters passed to scale-specific stop-length hooks. */
export type ScaleStopLengthParams = {
    name: string;
    kind: ScaleStopKind;
    scale: ChannelScale;
};

/** Parameters passed to scale-specific stop normalization hooks. */
export type ScaleStopNormalizeParams = {
    name: string;
    channel: ChannelConfigResolved;
    scale: ChannelScale;
    kind: ScaleStopKind;
    getDefaultScaleRange: (name: string) => number[] | null | undefined;
};

/** Normalized stop arrays returned by scale-specific hooks. */
export type ScaleStopNormalizeResult = {
    domain: number[];
    range: Array<number | number[]>;
    domainLength: number;
    rangeLength: number;
};

/** Parameters passed to scale-specific domain normalization hooks. */
export type ScaleDomainNormalizeParams = {
    name: string;
    scale: ChannelScale;
    domain: unknown;
    domainLength: number;
};

/** Parameters passed to scale-specific domain-map normalization hooks. */
export type ScaleDomainMapParams = {
    name: string;
    scale: ChannelScale;
    domain: ArrayLike<number>;
};

/** Result of a scale-specific domain-map normalization hook. */
export type ScaleDomainMapUpdate = {
    domainMap: number[];
    domainUniform?: number[];
};

/**
 * Scale definition contract. This combines metadata, resource requirements,
 * and the WGSL emitter used for scale-specific shader code.
 */
export type ScaleDef = {
    /** Diagnostic name; dispatch uses the definition value, not this string. */
    readonly type: string;

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
     * Whether the scale can accept u32 input even when the channel spec expects
     * f32 (useful for ordinal/band/index ids).
     */
    allowsU32InputOverride?: boolean;

    /**
     * Whether the scale can accept f32 input when the mark channel stores
     * u32 output (useful for numeric threshold encodings of enum channels).
     */
    allowsF32InputOverride?: boolean;

    /**
     * Whether the scale can accept packed u32 input (two components) while
     * producing scalar output (used by the high-precision index scale).
     */
    allowsPackedScalarInput?: boolean;

    /**
     * Optional WGSL snippet implementing the scale helpers (scaleLinear, etc).
     * This is stitched into the global shader prelude with dependencies.
     */
    wgsl?: string;

    /**
     * Optional list of scale names whose WGSL must be emitted before this scale.
     */
    wgslDeps?: ScaleDef[];

    /** Optional scale-specific validation hook. */
    validate?: (context: ScaleValidationContext) => ScaleValidationResult;

    /** Optional hook for computing stop-array lengths. */
    getStopLengths?: (
        params: ScaleStopLengthParams
    ) => ScaleStopLengths | undefined;

    /** Optional hook for scale-specific stop normalization. */
    normalizeStops?: (
        params: ScaleStopNormalizeParams
    ) => ScaleStopNormalizeResult | undefined;

    /** Optional hook for normalizing continuous domain values. */
    normalizeDomain?: (
        params: ScaleDomainNormalizeParams
    ) => number[] | undefined;

    /** Optional hook for normalizing ordinal domain maps and related uniforms. */
    normalizeDomainMap?: (
        params: ScaleDomainMapParams
    ) => ScaleDomainMapUpdate | null;

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

    /** Conditional overrides applied when selection predicates match. */
    conditions?: ChannelCondition[];
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
    SeriesChannelConfigInput | ValueChannelConfigInput
) &
    ChannelConfigWithScale;

/** User-supplied configs; may be partial because defaults are filled later. */
export type ChannelConfigWithoutScaleInput = (
    SeriesChannelConfigInput | ValueChannelConfigInput
) &
    ChannelConfigWithoutScale;

/** Any user-facing channel config (may omit data/value until normalized). */
export type ChannelConfigInput =
    ChannelConfigWithScaleInput | ChannelConfigWithoutScaleInput;

/** Channel config allowed inside conditions (no defaults or nested conditions). */
export type ConditionalChannelConfigInput = Omit<
    ChannelConfigInput,
    "conditions" | "default"
> & {
    /** Allow conditional value channels to opt into uniform-backed updates. */
    dynamic?: boolean;
};

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
    | "uniqueId"
    | "x"
    | "x2"
    | "y"
    | "y2"
    | "xOffset"
    | "x2Offset"
    | "yOffset"
    | "y2Offset"
    | "fill"
    | "stroke"
    | "fillOpacity"
    | "strokeOpacity"
    | "strokeWidth"
    | "cornerRadiusTopRight"
    | "cornerRadiusBottomRight"
    | "cornerRadiusTopLeft"
    | "cornerRadiusBottomLeft"
    | "minWidth"
    | "minHeight"
    | "minOpacity"
    | "shadowOffsetX"
    | "shadowOffsetY"
    | "shadowBlur"
    | "shadowOpacity"
    | "shadowColor"
    | "hatchPattern";

export type RectChannels = Partial<Record<RectChannelName, ChannelConfigInput>>;

export type PointChannelName =
    | "uniqueId"
    | "x"
    | "y"
    | "size"
    | "shape"
    | "strokeWidth"
    | "dx"
    | "dy"
    | "fill"
    | "stroke"
    | "fillOpacity"
    | "strokeOpacity"
    | "angle"
    | "gradientStrength"
    | "inwardStroke"
    | "minPickingSize";

export type PointChannels = Partial<
    Record<PointChannelName, ChannelConfigInput>
>;

export type RuleChannelName =
    | "uniqueId"
    | "x"
    | "x2"
    | "y"
    | "y2"
    | "xOffset"
    | "x2Offset"
    | "yOffset"
    | "y2Offset"
    | "size"
    | "color"
    | "opacity"
    | "minLength"
    | "strokeCap"
    | "strokeDash"
    | "strokeDashOffset";

export type RuleChannels = Partial<Record<RuleChannelName, ChannelConfigInput>>;

export type LinkChannelName =
    | "uniqueId"
    | "x"
    | "x2"
    | "y"
    | "y2"
    | "xOffset"
    | "x2Offset"
    | "yOffset"
    | "y2Offset"
    | "size"
    | "color"
    | "opacity";

export type LinkChannels = Partial<Record<LinkChannelName, ChannelConfigInput>>;

export type ArrowChannelName =
    | "uniqueId"
    | "x"
    | "x2"
    | "y"
    | "y2"
    | "xOffset"
    | "x2Offset"
    | "yOffset"
    | "y2Offset"
    | "fill"
    | "stroke"
    | "fillOpacity"
    | "strokeOpacity"
    | "strokeWidth"
    | "size"
    | "direction";

export type ArrowChannels = Partial<
    Record<ArrowChannelName, ChannelConfigInput>
>;

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

export type TextSeries = Record<string, TypedArray | string | string[]> & {
    text: string | string[];
};

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

export type FontResource = {
    metrics: unknown;
    bitmap: string | ImageBitmap;
};

export type TextMarkOptions = {
    textLayout?: TextLayout;
    font?: string;
    fontResource?: FontResource;
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
              : T extends "arrow"
                ? ArrowChannels
                : T extends "text"
                  ? TextChannels
                  : Record<string, ChannelConfigInput>;

    /**
     * Number of instances to draw. If omitted, the count is inferred from
     * series buffer lengths when possible.
     */
    count?: number;

    /** Fixed placement selection mode for the retained mark. */
    placementIndex?: { source: "draw" } | { data: Uint32Array; type: "u32" };

    /** Existing mark-program uniforms that may be updated without rebuilding. */
    dynamicValues?: Record<string, DynamicValueConfig>;
} & (T extends "rule"
    ? {
          /**
           * Dash patterns for rule marks. Each pattern is an even-length array
           * of segment lengths expressed in stroke-width units.
           */
          dashPatterns?: number[][];
      }
    : unknown) & {
        /** Non-visual scalar series used by visibility predicates. */
        inputs?: Record<string, ScalarInputConfig>;
        /** Retained scalar uniforms used by visibility predicates. */
        scalarSlots?: Record<string, ScalarSlotConfig>;
        /** Immutable predicate controlling mark visibility and picking. */
        visibleWhen?: VisibilityPredicate;
    } & (T extends "link" ? LinkMarkOptions : unknown) &
    (T extends "text" ? TextMarkOptions : unknown);

export type RendererOptions = {
    alphaMode?: GPUCanvasAlphaMode;
    format?: GPUTextureFormat;
    /** Called when asynchronous renderer work requires the host to draw again. */
    onInvalidate?: () => void;
};

export type GlobalUniforms = {
    width: number;
    height: number;
    dpr: number;
};

export type DrawRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type DrawVisibleRange = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    cullX: boolean;
    cullY: boolean;
};

export type PlacementSetData = {
    /** Packed viewport-local normalized [x, y, width, height] rectangles. */
    rectangles: Float32Array;
};

export type PlacementSetHandle = {
    readonly placementSetId: number;
    readonly count: number;
    replace(data: PlacementSetData): void;
    destroy(): void;
};

export type DrawPlacement = {
    set: Pick<PlacementSetHandle, "placementSetId">;
    index?: number;
    clipToPlacement?: "x" | "y" | "xy";
};

export type DrawCommand = {
    /** Retained mark whose resources are reused for this occurrence. */
    mark: Pick<MarkHandle, "markId">;
    /**
     * Logical-pixel viewport. Mark position ranges are local to this rectangle.
     * Defaults to the full logical canvas.
     */
    viewport?: DrawRect;
    /** Logical-pixel clipping rectangle. Defaults to the full canvas. */
    scissor?: DrawRect;
    /** Optional directional anchor-culling bounds in logical pixels. */
    visibleRange?: DrawVisibleRange;
    /** First retained instance to draw. Defaults to zero. */
    firstInstance?: number;
    /** Number of retained instances to draw. Defaults to the remaining count. */
    instanceCount?: number;
    placement?: DrawPlacement;
};

export type RenderFrame = {
    /** Ordered mark occurrences. Defaults to all retained marks in creation order. */
    draws?: Iterable<DrawCommand>;
    /** Canvas clear color. Defaults to opaque white. */
    clearColor?: GPUColor;
};

export type ProgramDrawOptions = {
    firstInstance: number;
    instanceCount: number;
    placement?: {
        bindGroup: GPUBindGroup;
        count: number;
        index?: number;
        clipToPlacement?: "x" | "y" | "xy";
        clipMode?: number;
    };
};

export class RendererError extends Error {}

export type MarkProgram<
    TSeries extends Record<string, SeriesData> = Record<string, SeriesData>,
> = {
    readonly count: number;
    readonly _placementIndex?: MarkConfig["placementIndex"];
    getSlotHandles(): Omit<MarkHandle<TSeries>, "markId">;
    replaceSeries(channels: TSeries, count?: number): void;
    updateValues(values: Record<string, number | number[]>): void;
    debugResources(label?: string): void;
    draw(pass: GPURenderPassEncoder, options: ProgramDrawOptions): void;
    drawPick(pass: GPURenderPassEncoder, options: ProgramDrawOptions): void;
    destroy(): void;
};

export type MarkDefinition<
    TConfig = MarkConfig,
    TSeries extends Record<string, SeriesData> = Record<string, TypedArray>,
> = Readonly<{
    /** Diagnostic name; dispatch uses the definition value, not this string. */
    type: string;
    createProgram(renderer: Renderer, config: TConfig): MarkProgram<TSeries>;
}>;

export class Renderer {
    /** Update global viewport-related uniforms (pixel size + device pixel ratio). */
    updateGlobals(globals: GlobalUniforms): void;

    /** Create a retained mark from an explicitly imported definition. */
    createMark<TConfig, TSeries extends Record<string, SeriesData>>(
        definition: MarkDefinition<TConfig, TSeries>,
        config: TConfig
    ): MarkHandle<TSeries>;

    /** Create a retained, renderer-owned placement table. */
    createPlacementSet(data: PlacementSetData): PlacementSetHandle;

    /** Log the GPU resources reserved by a mark to the console. */
    debugResources(markId: MarkId, label?: string): void;

    /**
     * Render (if needed) and read a pick id at the given canvas coordinate.
     */
    pick(x: number, y: number): Promise<number | null>;

    /** Draw an ordered frame of retained mark occurrences. */
    render(frame?: RenderFrame): void;

    /** Replace the ordered draw list used by the on-demand pick pass. */
    renderPicking(frame?: RenderFrame): void;

    /** Destroy GPU resources associated with a mark. */
    destroyMark(markId: MarkId): void;

    /** Destroy every renderer-owned GPU resource. Safe to call repeatedly. */
    destroy(): void;
}

export function createRenderer(
    canvas: HTMLCanvasElement,
    options?: RendererOptions
): Promise<Renderer>;
