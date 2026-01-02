import BaseProgram from "./baseProgram.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";
import { buildTextLayout } from "../../fonts/layout.js";
import BmFontManager from "../../fonts/bmFontManager.js";
import { SDF_PADDING } from "../../fonts/bmFontMetrics.js";
import { createTextureFromData } from "../../utils/webgpuTextureUtils.js";

/**
 * Text rendering overview (SDF + per-glyph instancing).
 *
 * - A text "instance" is a logical string with its own channels (x/y/size/etc).
 * - The layout step expands each string into a stream of glyphs. Each glyph
 *   becomes one draw instance (6 vertices for a quad).
 * - Per-glyph buffers:
 *   - glyphs: { stringIndex, xOffset, yOffset } per glyph (stringIndex points
 *     back to the parent string).
 *   - glyphMetrics: per glyphId, stores atlas rect (x,y,w,h) and metrics
 *     (yOffset). This is indexed by the glyph id emitted from layout.
 * - Per-string buffer:
 *   - stringMetrics: width/height per string, used for alignment and baseline.
 * - Texture:
 *   - fontAtlas: msdf atlas texture for the current font (one font per mark).
 *
 * Channel data is expanded so that every glyph instance can read its parent
 * string's attributes (x/y/size/fill/etc.) using the existing series buffer
 * path. This keeps shader generation simple at the cost of duplication.
 * Alignment and baseline are applied in the vertex shader using stringMetrics,
 * then glyph quads are positioned, rotated, and projected in pixel space.
 * The fragment shader samples the atlas and converts SDF values to alpha.
 */

/**
 * @typedef {import("../../index.d.ts").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("../../index.d.ts").TextChannels} TextChannels
 * @typedef {import("../../index.d.ts").TextStringChannelConfigInput} TextStringChannelConfigInput
 * @typedef {import("../../index.d.ts").TypedArray} TypedArray
 * @typedef {ReturnType<BmFontManager["getFont"]>} FontEntry
 * @typedef {number|"thin"|"light"|"regular"|"normal"|"medium"|"bold"|"black"} FontWeightInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const TEXT_CHANNEL_SPECS = {
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { components: 1, scale: "linear", default: 0.5 },
    y: { components: 1, scale: "linear", default: 0.5 },
    text: { type: "u32", components: 1, default: 0 },
    size: { type: "f32", components: 1, default: 12.0 },
    angle: { type: "f32", components: 1, default: 0.0 },
    dx: { type: "f32", components: 1, default: 0.0 },
    dy: { type: "f32", components: 1, default: 0.0 },
    align: { type: "u32", components: 1, default: 1 },
    baseline: { type: "u32", components: 1, default: 1 },
    fill: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    opacity: { type: "f32", components: 1, default: 1.0 },
};

const {
    channels: CHANNELS,
    defaults: DEFAULTS,
    defaultConfigs: DEFAULT_CHANNEL_CONFIGS,
    optionalChannels: OPTIONAL_CHANNELS,
} = buildChannelMaps(TEXT_CHANNEL_SPECS);

const TEXT_SHADER_BODY = /* wgsl */ `
struct GlyphInstance {
    stringIndex: u32,
    xOffset: f32,
    yOffset: f32,
    pad: f32,
};

struct StringMetrics {
    width: f32,
    height: f32,
};

struct GlyphMetrics {
    texRect: vec4<f32>,
    metrics: vec4<f32>,
};

const ALIGN_LEFT: u32 = 0u;
const ALIGN_CENTER: u32 = 1u;
const ALIGN_RIGHT: u32 = 2u;

const BASELINE_ALPHABETIC: u32 = 0u;
const BASELINE_MIDDLE: u32 = 1u;
const BASELINE_TOP: u32 = 2u;
const BASELINE_BOTTOM: u32 = 3u;

struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) opacity: f32,
    @location(3) slope: f32,
};

fn alignOffset(align: u32, width: f32) -> f32 {
    if (align == ALIGN_CENTER) {
        return -0.5 * width;
    }
    if (align == ALIGN_RIGHT) {
        return -width;
    }
    return 0.0;
}

fn baselineOffset(baseline: u32) -> f32 {
    var offset = -params.uSdfPadding;
    if (baseline == BASELINE_TOP) {
        offset = offset + params.uCapHeight;
    } else if (baseline == BASELINE_MIDDLE) {
        offset = offset + params.uCapHeight * 0.5;
    } else if (baseline == BASELINE_BOTTOM) {
        offset = offset - params.uDescent;
    }
    return offset;
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    var quad = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0)
    );

    let glyph = glyphs[i];
    let textMetrics = stringMetrics[glyph.stringIndex];
    let glyphId = u32(getScaled_text(i));
    let metrics = glyphMetrics[glyphId];
    let size = getScaled_size(i);
    let sizeScale = size / params.uFontBase;
    let sizeRatio = size / params.uLayoutFontSize;
    var local = quad[v];
    local.y = 1.0 - local.y;
    let width = metrics.texRect.z * sizeScale;
    let height = metrics.texRect.w * sizeScale;
    let baseline = baselineOffset(u32(getScaled_baseline(i)));
    let bottom = -(metrics.texRect.w + metrics.metrics.x + baseline) * sizeScale;
    let x = alignOffset(u32(getScaled_align(i)), textMetrics.width * sizeRatio) +
        glyph.xOffset * sizeRatio;
    let y = glyph.yOffset * sizeRatio;
    let localPos = vec2<f32>(x + local.x * width, y + bottom + local.y * height);
    let d = vec2<f32>(getScaled_dx(i), getScaled_dy(i));
    let angle = -getScaled_angle(i) * 3.14159265 / 180.0;
    let sinTheta = sin(angle);
    let cosTheta = cos(angle);
    let rot = mat2x2<f32>(cosTheta, sinTheta, -sinTheta, cosTheta);
    let rotated = rot * (localPos + d);
    let anchor = vec2<f32>(getScaled_x(i), getScaled_y(i));
    let pixel = anchor + rotated;

    let clip = vec2<f32>(
        (pixel.x / globals.width) * 2.0 - 1.0,
        1.0 - (pixel.y / globals.height) * 2.0
    );

    var out: VSOut;
    out.pos = vec4<f32>(clip, 0.0, 1.0);
    out.uv = (metrics.texRect.xy + local * metrics.texRect.zw) * params.uAtlasScale;
    out.color = getScaled_fill(i);
    out.opacity = getScaled_opacity(i);
    let minSize = min(width, height);
    out.slope = max(1.0, minSize / params.uSdfNumerator * globals.dpr);
    return out;
}

fn median(r: f32, g: f32, b: f32) -> f32 {
    return max(min(r, g), min(max(r, g), b));
}

fn sampleSdf(uv: vec2<f32>) -> f32 {
    let c = textureSample(fontAtlas, fontSampler, uv).rgb;
    return 1.0 - median(c.r, c.g, c.b);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    let dist = sampleSdf(in.uv);
    let alpha = clamp((dist - 0.5) * in.slope + 0.5, 0.0, 1.0);
    let color = vec4<f32>(in.color.rgb, in.color.a * in.opacity);
    return color * alpha;
}
`;

/**
 * @typedef {object} TextConfigInput
 * @prop {TextChannels} [channels]
 * @prop {number} [count]
 * @prop {unknown} [textLayout]
 * @prop {unknown} [font]
 * @prop {unknown} [fontStyle]
 * @prop {unknown} [fontWeight]
 * @prop {unknown} [fontSize]
 * @prop {unknown} [lineHeight]
 * @prop {unknown} [letterSpacing]
 */

/**
 * @param {TextConfigInput} [params]
 * @returns {{ normalized: { channels: Record<string, ChannelConfigInput>, count?: number }, textLayout: import("../../fonts/layout.js").TextLayout, fontEntry: FontEntry }}
 */
function normalizeTextConfig({
    channels = {},
    count,
    textLayout,
    font,
    fontStyle,
    fontWeight,
    fontSize,
    lineHeight,
    letterSpacing,
} = {}) {
    /** @type {Record<string, ChannelConfigInput | TextStringChannelConfigInput>} */
    const normalizedChannels = { ...channels };
    const resolvedStyle = fontStyle === "italic" ? "italic" : "normal";
    const resolvedWeight =
        typeof fontWeight === "number" || typeof fontWeight === "string"
            ? /** @type {FontWeightInput} */ (fontWeight)
            : 400;
    const fontManager = new BmFontManager();
    const fontEntry = fontManager.getFont(
        typeof font === "string" ? font : "Lato",
        resolvedStyle,
        resolvedWeight
    );
    const textChannel =
        /** @type {ChannelConfigInput | TextStringChannelConfigInput | undefined} */ (
            normalizedChannels.text
        );
    /** @type {string[]} */
    let strings = [];

    if (textLayout) {
        const layout =
            /** @type {import("../../fonts/layout.js").TextLayout} */ (
                textLayout
            );
        const stringCount = layout.textWidth.length;
        if (count !== undefined && count !== stringCount) {
            throw new Error(
                `Text layout count (${stringCount}) does not match count (${count}).`
            );
        }
        normalizedChannels.text = {
            data: layout.glyphIds,
            type: "u32",
            components: 1,
            scale: { type: "identity" },
        };
        const glyphCount = layout.glyphIds.length;
        expandTextSeries(normalizedChannels, layout.stringIndex, stringCount);
        return {
            normalized: {
                channels: /** @type {Record<string, ChannelConfigInput>} */ (
                    normalizedChannels
                ),
                count: glyphCount,
            },
            textLayout: layout,
            fontEntry,
        };
    }

    if (
        textChannel &&
        "data" in textChannel &&
        textChannel.data !== undefined
    ) {
        if (Array.isArray(textChannel.data)) {
            strings = /** @type {string[]} */ (textChannel.data);
        } else {
            throw new Error(
                "Text channel data must be a string array when no textLayout is provided."
            );
        }
    } else if (
        textChannel &&
        "value" in textChannel &&
        textChannel.value !== undefined
    ) {
        const textValue = textChannel.value;
        if (typeof textValue !== "string") {
            throw new Error(
                "Text channel value must be a string when no textLayout is provided."
            );
        }
        const repeat = count ?? 1;
        strings = Array.from({ length: repeat }, () => textValue);
    } else {
        const repeat = count ?? 0;
        strings = Array.from({ length: repeat }, () => "");
    }

    const layout = buildTextLayout({
        strings,
        fontManager,
        font: {
            family: typeof font === "string" ? font : "Lato",
            style: resolvedStyle,
            weight: resolvedWeight,
        },
        fontSize: typeof fontSize === "number" ? fontSize : 12,
        lineHeight: typeof lineHeight === "number" ? lineHeight : 1.0,
        letterSpacing: typeof letterSpacing === "number" ? letterSpacing : 0.0,
    });
    normalizedChannels.text = {
        data: layout.glyphIds,
        type: "u32",
        components: 1,
        scale: { type: "identity" },
    };
    expandTextSeries(normalizedChannels, layout.stringIndex, strings.length);

    return {
        normalized: {
            channels: /** @type {Record<string, ChannelConfigInput>} */ (
                normalizedChannels
            ),
            count: layout.glyphIds.length,
        },
        textLayout: layout,
        fontEntry,
    };
}

/**
 * @param {Record<string, ChannelConfigInput | TextStringChannelConfigInput>} channels
 * @param {Uint32Array} stringIndex
 * @param {number} stringCount
 * @returns {void}
 */
function expandTextSeries(channels, stringIndex, stringCount) {
    const glyphCount = stringIndex.length;
    for (const [name, channel] of Object.entries(channels)) {
        if (!channel || typeof channel !== "object") {
            continue;
        }
        if (!("data" in channel) || channel.data === undefined) {
            continue;
        }
        const spec = TEXT_CHANNEL_SPECS[name];
        const components =
            "components" in channel && channel.components != null
                ? channel.components
                : (spec?.components ?? 1);
        const data = channel.data;
        if (ArrayBuffer.isView(data)) {
            if (data.length === glyphCount * components) {
                continue;
            }
            if (data.length !== stringCount * components) {
                throw new Error(
                    `Text channel "${name}" expects ${stringCount} values, got ${data.length / components}.`
                );
            }
            const Expanded = /** @type {new (length: number) => TypedArray} */ (
                data.constructor
            );
            const expanded = new Expanded(glyphCount * components);
            for (let i = 0; i < glyphCount; i++) {
                const src = stringIndex[i] * components;
                const dest = i * components;
                for (let c = 0; c < components; c++) {
                    expanded[dest + c] = data[src + c];
                }
            }
            channel.data = expanded;
        }
    }
}

/**
 * @param {Record<string, TypedArray>} channels
 * @param {Uint32Array} stringIndex
 * @param {number} stringCount
 * @returns {Record<string, TypedArray>}
 */
function expandTextSeriesArrays(channels, stringIndex, stringCount) {
    const glyphCount = stringIndex.length;
    /** @type {Record<string, TypedArray>} */
    const expanded = {};
    for (const [name, data] of Object.entries(channels)) {
        if (!ArrayBuffer.isView(data)) {
            continue;
        }
        const spec = TEXT_CHANNEL_SPECS[name];
        const components = spec?.components ?? 1;
        if (data.length === glyphCount * components) {
            expanded[name] = data;
            continue;
        }
        if (data.length !== stringCount * components) {
            throw new Error(
                `Text channel "${name}" expects ${stringCount} values, got ${data.length / components}.`
            );
        }
        const Expanded = /** @type {new (length: number) => TypedArray} */ (
            data.constructor
        );
        const next = new Expanded(glyphCount * components);
        for (let i = 0; i < glyphCount; i++) {
            const src = stringIndex[i] * components;
            const dest = i * components;
            for (let c = 0; c < components; c++) {
                next[dest + c] = data[src + c];
            }
        }
        expanded[name] = next;
    }
    return expanded;
}

export default class TextProgram extends BaseProgram {
    /**
     * @param {import("../../renderer.js").Renderer} renderer
     * @param {import("../../index.d.ts").MarkConfig<"text">} config
     */
    constructor(renderer, config) {
        const { normalized, textLayout, fontEntry } =
            normalizeTextConfig(config);
        super(renderer, { ...config, ...normalized, textLayout, fontEntry });
        this._textLayout = textLayout;
        this._fontEntry = fontEntry;
    }

    /**
     * @returns {string[]}
     */
    get channelOrder() {
        return CHANNELS;
    }

    /**
     * @returns {string[]}
     */
    get optionalChannels() {
        return OPTIONAL_CHANNELS;
    }

    /**
     * @returns {Record<string, ChannelConfigInput>}
     */
    get defaultChannelConfigs() {
        return DEFAULT_CHANNEL_CONFIGS;
    }

    /**
     * @returns {Record<string, number|number[]>}
     */
    get defaultValues() {
        return DEFAULTS;
    }

    /**
     * @returns {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>}
     */
    get channelSpecs() {
        return TEXT_CHANNEL_SPECS;
    }

    /**
     * @returns {string}
     */
    get shaderBody() {
        return TEXT_SHADER_BODY;
    }

    /**
     * @returns {import("../../utils/uniformLayout.js").UniformSpec[]}
     */
    getExtraUniformLayout() {
        return [
            { name: "uFontBase", type: "f32", components: 1 },
            { name: "uLayoutFontSize", type: "f32", components: 1 },
            { name: "uAtlasScale", type: "f32", components: 2 },
            { name: "uCapHeight", type: "f32", components: 1 },
            { name: "uDescent", type: "f32", components: 1 },
            { name: "uSdfPadding", type: "f32", components: 1 },
            { name: "uSdfNumerator", type: "f32", components: 1 },
        ];
    }

    /**
     * @returns {import("../shaders/markShaderBuilder.js").ExtraResourceDef[]}
     */
    getExtraResourceDefs() {
        return [
            {
                name: "glyphs",
                role: "extraBuffer",
                kind: "buffer",
                bufferType: "read-only-storage",
                visibility: "vertex",
                wgslName: "glyphs",
                wgslType: "array<GlyphInstance>",
            },
            {
                name: "stringMetrics",
                role: "extraBuffer",
                kind: "buffer",
                bufferType: "read-only-storage",
                visibility: "vertex",
                wgslName: "stringMetrics",
                wgslType: "array<StringMetrics>",
            },
            {
                name: "glyphMetrics",
                role: "extraBuffer",
                kind: "buffer",
                bufferType: "read-only-storage",
                visibility: "vertex",
                wgslName: "glyphMetrics",
                wgslType: "array<GlyphMetrics>",
            },
            {
                name: "fontAtlas",
                role: "extraTexture",
                kind: "texture",
                sampleType: "float",
                dimension: "2d",
                visibility: "fragment",
                wgslName: "fontAtlas",
            },
            {
                name: "fontAtlas",
                role: "extraSampler",
                kind: "sampler",
                samplerType: "filtering",
                visibility: "fragment",
                wgslName: "fontSampler",
            },
        ];
    }

    _initializeExtraResources() {
        const layout =
            /** @type {import("../../fonts/layout.js").TextLayout} */ (
                this._markConfig.textLayout
            );
        const fontEntry = /** @type {FontEntry} */ (this._markConfig.fontEntry);
        const metrics = fontEntry.metrics;
        const atlasWidth = metrics.common.scaleW;
        const atlasHeight = metrics.common.scaleH;

        this._setUniformValue("uFontBase", metrics.common.base);
        this._setUniformValue("uLayoutFontSize", layout.fontSize);
        this._setUniformValue("uAtlasScale", [1 / atlasWidth, 1 / atlasHeight]);
        this._setUniformValue("uCapHeight", metrics.capHeight);
        this._setUniformValue("uDescent", metrics.descent);
        this._setUniformValue("uSdfPadding", SDF_PADDING);
        this._setUniformValue("uSdfNumerator", metrics.common.base * 0.35);

        const glyphCount = layout.glyphIds.length;
        const glyphData = new ArrayBuffer(glyphCount * 16);
        const glyphU32 = new Uint32Array(glyphData);
        const glyphF32 = new Float32Array(glyphData);
        for (let i = 0; i < glyphCount; i++) {
            const base = i * 4;
            glyphU32[base] = layout.stringIndex[i];
            glyphF32[base + 1] = layout.xOffset[i];
            glyphF32[base + 2] = layout.yOffset ? layout.yOffset[i] : 0;
            glyphF32[base + 3] = 0;
        }
        const glyphBuffer = this.device.createBuffer({
            size: glyphData.byteLength,
            // eslint-disable-next-line no-undef
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(glyphBuffer, 0, glyphData);
        this._extraBuffers.set("glyphs", glyphBuffer);

        const stringCount = layout.textWidth.length;
        const stringData = new Float32Array(stringCount * 2);
        for (let i = 0; i < stringCount; i++) {
            const base = i * 2;
            stringData[base] = layout.textWidth[i];
            stringData[base + 1] = layout.textHeight[i];
        }
        const stringBuffer = this.device.createBuffer({
            size: stringData.byteLength,
            // eslint-disable-next-line no-undef
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(stringBuffer, 0, stringData);
        this._extraBuffers.set("stringMetrics", stringBuffer);

        const glyphMetricsLength = metrics.maxCharId + 1;
        const glyphMetricsData = new Float32Array(glyphMetricsLength * 8);
        for (const glyph of metrics.chars) {
            const base = glyph.id * 8;
            glyphMetricsData[base] = glyph.x;
            glyphMetricsData[base + 1] = glyph.y;
            glyphMetricsData[base + 2] = glyph.width;
            glyphMetricsData[base + 3] = glyph.height;
            glyphMetricsData[base + 4] = glyph.yoffset;
            glyphMetricsData[base + 5] = 0;
            glyphMetricsData[base + 6] = 0;
            glyphMetricsData[base + 7] = 0;
        }
        const glyphMetricsBuffer = this.device.createBuffer({
            size: glyphMetricsData.byteLength,
            // eslint-disable-next-line no-undef
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(glyphMetricsBuffer, 0, glyphMetricsData);
        this._extraBuffers.set("glyphMetrics", glyphMetricsBuffer);

        const sampler = this.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
        });

        const placeholder = createTextureFromData(this.device, {
            format: "rgba8unorm",
            width: 1,
            height: 1,
            data: new Uint8Array([255, 255, 255, 255]),
        });

        this._extraTextures.set("fontAtlas", {
            texture: placeholder,
            sampler,
            width: 1,
            height: 1,
            format: "rgba8unorm",
        });

        this._uploadFontAtlas(fontEntry.bitmap);
    }

    /**
     * @param {string | ImageBitmap} bitmap
     * @returns {void}
     */
    _uploadFontAtlas(bitmap) {
        if (
            typeof ImageBitmap !== "undefined" &&
            bitmap instanceof ImageBitmap
        ) {
            this._setAtlasFromBitmap(bitmap);
            return;
        }
        if (typeof bitmap !== "string") {
            return;
        }
        if (typeof Image === "undefined") {
            return;
        }
        const image = new Image();
        image.src = bitmap;
        const onReady = () => {
            this._setAtlasFromBitmap(image);
        };
        if (image.decode) {
            image
                .decode()
                .then(onReady)
                .catch(() => {
                    image.onload = onReady;
                });
        } else {
            image.onload = onReady;
        }
    }

    /**
     * @param {ImageBitmap | HTMLImageElement} image
     * @returns {void}
     */
    _setAtlasFromBitmap(image) {
        const texture = this.device.createTexture({
            size: {
                width: image.width,
                height: image.height,
                depthOrArrayLayers: 1,
            },
            format: "rgba8unorm",
            /* eslint-disable no-undef */
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
            /* eslint-enable no-undef */
        });
        this.device.queue.copyExternalImageToTexture(
            { source: image },
            { texture },
            { width: image.width, height: image.height }
        );
        const entry = this._extraTextures.get("fontAtlas");
        if (entry) {
            entry.texture = texture;
            entry.width = image.width;
            entry.height = image.height;
            entry.format = "rgba8unorm";
        }
        if (this._bindGroupLayout) {
            this._rebuildBindGroup();
        }
        this.renderer.render();
    }

    /**
     * @param {Record<string, TypedArray>} channels
     * @param {number} [count]
     * @returns {void}
     */
    updateSeries(channels, count) {
        const layout = this._textLayout;
        if (layout && layout.stringIndex.length > 0) {
            const stringCount = layout.textWidth.length;
            const next = expandTextSeriesArrays(
                channels,
                layout.stringIndex,
                stringCount
            );
            super.updateSeries(next, layout.glyphIds.length);
            return;
        }
        super.updateSeries(channels, count);
    }
}
