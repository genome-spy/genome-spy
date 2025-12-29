export type MarkType = "rect";
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

export type ChannelConfigBase = {
    /** Vector width when series data stores packed vectors (e.g., RGBA). */
    components?: 1 | 2 | 4;
    /** Default if no series data or value is supplied. */
    default?: number | number[];
};

export type ChannelConfigWithScale = ChannelConfigBase & {
    /** Scale applied to raw (domain-space) values. */
    scale: ChannelScale;
};

export type ChannelConfigWithoutScale = ChannelConfigBase & {
    /** Range-space values; no scale transformation. */
    scale?: never;
};

export type BufferChannelConfigWithScale = ChannelConfigWithScale & {
    /** Columnar data for this channel when using series. */
    data: TypedArray;
    /** Scalar element type for series data. */
    type: "f32" | "u32" | "i32";
};

export type BufferChannelConfig = ChannelConfigWithoutScale & {
    data: TypedArray;
    type: "f32" | "u32" | "i32";
};

export type UniformChannelConfigWithScale = ChannelConfigWithScale & {
    /** Uniform value in domain space (scaled in the renderer). */
    value: number | number[];
};

export type UniformChannelConfig = ChannelConfigWithoutScale & {
    /** Uniform value in range space (used directly). */
    value: number | number[];
};

export type ChannelConfig =
    | BufferChannelConfigWithScale
    | BufferChannelConfig
    | UniformChannelConfigWithScale
    | UniformChannelConfig;

export type RectChannels = {
    /** Optional per-instance ID used for picking or selection. */
    uniqueId?: ChannelConfig;
    x?: ChannelConfig;
    x2?: ChannelConfig;
    y?: ChannelConfig;
    y2?: ChannelConfig;
    fill?: ChannelConfig;
    stroke?: ChannelConfig;
    fillOpacity?: ChannelConfig;
    strokeOpacity?: ChannelConfig;
    strokeWidth?: ChannelConfig;
};

export type MarkConfig<T extends MarkType = MarkType> = {
    channels: T extends "rect" ? RectChannels : Record<string, ChannelConfig>;
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
    updateGlobals(globals: GlobalUniforms): void;
    createMark<T extends MarkType>(type: T, config: MarkConfig<T>): MarkId;
    updateInstances(
        markId: MarkId,
        fields: Record<string, TypedArray>,
        count: number
    ): void;
    updateUniforms(
        markId: MarkId,
        uniforms: Record<
            string,
            | number
            | number[]
            | { domain?: [number, number]; range?: [number, number] }
        >
    ): void;
    render(): void;
    destroyMark(markId: MarkId): void;
}

export function createRenderer(
    canvas: HTMLCanvasElement,
    options?: RendererOptions
): Promise<Renderer>;

export function isChannelConfigWithScale(
    config: ChannelConfig
): config is ChannelConfigWithScale;
export function isChannelConfigWithoutScale(
    config: ChannelConfig
): config is ChannelConfigWithoutScale;
export function isBufferChannelConfig(
    config: ChannelConfig
): config is BufferChannelConfig | BufferChannelConfigWithScale;
export function isUniformChannelConfig(
    config: ChannelConfig
): config is UniformChannelConfig | UniformChannelConfigWithScale;
