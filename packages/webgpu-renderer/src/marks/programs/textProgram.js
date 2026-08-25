import BaseProgram from "./internal/baseProgram.js";
import { initializePropertySlots } from "./internal/propertySlots.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";
import { linearScale } from "../../scales/linear.js";
import { buildTextLayout } from "../../fonts/layout.js";
import BmFontManager, { fetchBmFontBitmap } from "../../fonts/bmFontManager.js";
import { SDF_PADDING } from "../../fonts/bmFontMetrics.js";
import {
    asGpuBufferSource,
    createTextureFromData,
} from "../../utils/webgpuTextureUtils.js";
import { TEXT_GEOMETRY_WGSL } from "./textGeometry.wgsl.js";

/**
 * Text rendering overview (SDF + per-glyph instancing).
 *
 * - A text "instance" is a logical string with its own channels (x/y/size/etc).
 * - The layout step expands each string into a stream of glyphs. Each glyph
 *   becomes one draw instance (6 vertices for a quad).
 * - Per-glyph buffers:
 *   - glyphs: { stringIndex, glyphId, xOffset, yOffset } per glyph
 *     (stringIndex points back to the parent string).
 *   - glyphMetrics: per glyphId, stores atlas rect (x,y,w,h) and metrics
 *     (yOffset). This is indexed by the glyph id emitted from layout.
 * - Per-string buffer:
 *   - stringMetrics: width/height per string, used for alignment and baseline.
 * - Texture:
 *   - fontAtlas: msdf atlas texture for the current font (one font per mark).
 *
 * Channel data remains at logical-string cardinality. Text's generated channel
 * readers map the glyph instance through glyphs[i].stringIndex, so all glyphs
 * of a string share visual channels, visibility, placement, and picking id.
 * Alignment and baseline are applied in the vertex shader using stringMetrics,
 * then glyph quads are positioned, rotated, and projected in pixel space.
 * The fragment shader samples the atlas and converts SDF values to alpha.
 */

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("../../index.js").TextChannels} TextChannels
 * @typedef {import("../../index.js").TextStringChannelConfigInput} TextStringChannelConfigInput
 * @typedef {ReturnType<BmFontManager["getFont"]>} FontEntry
 * @typedef {number|"thin"|"light"|"regular"|"normal"|"medium"|"bold"|"black"} FontWeightInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const TEXT_CHANNEL_SPECS = {
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { components: 1, scale: linearScale(), default: 0.5 },
    x2: { components: 1, scale: linearScale(), optional: true },
    y: { components: 1, scale: linearScale(), default: 0.5 },
    y2: { components: 1, scale: linearScale(), optional: true },
    xOffset: { type: "f32", components: 1, default: 0.0 },
    x2Offset: { type: "f32", components: 1, default: 0 },
    yOffset: { type: "f32", components: 1, default: 0.0 },
    y2Offset: { type: "f32", components: 1, default: 0 },
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
    glyphId: u32,
    xOffset: f32,
    yOffset: f32,
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

const ALIGN_AXIS_LEFT: i32 = -1;
const ALIGN_AXIS_CENTER: i32 = 0;
const ALIGN_AXIS_RIGHT: i32 = 1;

${TEXT_GEOMETRY_WGSL}

struct VSOut {
#if defined(PLACEMENT_ENABLED)
    @location(15) @interpolate(flat) placementClip: vec4<f32>,
#endif
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) opacity: f32,
    @location(3) @interpolate(flat) slope: f32,
    @location(4) @interpolate(flat) gamma: f32,
    @location(5) @interpolate(flat) pickId: u32,
    @location(6) edgeFadeOpacity: f32,
};

fn culledText() -> VSOut {
    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = vec4<f32>(-1e9);
#endif
    out.pos = vec4<f32>(0.0);
    out.uv = vec2<f32>(0.0);
    out.color = vec4<f32>(0.0);
    out.opacity = 0.0;
    out.slope = 0.0;
    out.gamma = 1.0;
    out.pickId = 0u;
    out.edgeFadeOpacity = 0.0;
    return out;
}

fn minValue(v: vec4<f32>) -> f32 {
    return min(min(v.x, v.y), min(v.z, v.w));
}

fn maxValue(v: vec4<f32>) -> f32 {
    return max(max(v.x, v.y), max(v.z, v.w));
}

fn alignOffset(align: u32, width: f32) -> f32 {
    if (align == ALIGN_CENTER) {
        return -0.5 * width;
    }
    if (align == ALIGN_RIGHT) {
        return -width;
    }
    return 0.0;
}

// Linear ramp used for squeeze fading (smoothstep is too soft for SDFs).
fn linearstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

struct RangeResult {
    pos: f32,
    scale: f32,
}

// Range fitting in local pixel space: returns the adjusted anchor and scale.
fn positionInsideRange(
    a: f32,
    b: f32,
    width: f32,
    padding: f32,
    align: i32,
    flush: bool,
    viewportSpan: f32
) -> RangeResult {
    let paddedWidth = width + 2.0 * padding;

    // Text clearly outside the viewport.
    if (a > viewportSpan || b < 0.0) {
        return RangeResult(0.0, 0.0);
    }

    let span = b - a;

    // Extra room for keeping text inside the range.
    let extra = max(0.0, span - paddedWidth);
    var pos = 0.0;

    if (align == ALIGN_AXIS_CENTER) {
        // Centered: slide within the range if flush is enabled.
        var centre = a + b;
        if (flush) {
            let leftOver = max(0.0, paddedWidth - centre);
            centre = centre + min(leftOver, extra);

            let rightOver = max(0.0, paddedWidth + centre - 2.0 * viewportSpan);
            centre = centre - min(rightOver, extra);
        }
        pos = centre / 2.0;
    } else if (align == ALIGN_AXIS_LEFT) {
        // Left aligned.
        var edge = a;
        if (flush) {
            let over = max(0.0, -edge);
            edge = edge + min(over, extra);
        }
        pos = edge + padding;
    } else {
        // Right aligned.
        var edge = b;
        if (flush) {
            let over = max(0.0, edge - viewportSpan);
            edge = edge - min(over, extra);
        }
        pos = edge - padding;
    }

    let scale = clamp((span - padding) / paddedWidth, 0.0, 1.0);
    return RangeResult(pos, scale);
}

// Axis-aligned bounding box size after rotation.
fn calculateRotatedDimensions(size: vec2<f32>, rotationMatrix: mat2x2<f32>) -> vec2<f32> {
    let half = size * 0.5;
    let a = abs(rotationMatrix * vec2<f32>(half.x, half.y));
    let b = abs(rotationMatrix * vec2<f32>(-half.x, half.y));
    let c = abs(rotationMatrix * vec2<f32>(half.x, -half.y));
    let d = abs(rotationMatrix * vec2<f32>(-half.x, -half.y));
    return vec2<f32>(
        max(max(a.x, b.x), max(c.x, d.x)),
        max(max(a.y, b.y), max(c.y, d.y))
    ) * 2.0;
}

fn alignCodeToAxis(align: u32) -> i32 {
    if (align == ALIGN_LEFT) {
        return ALIGN_AXIS_LEFT;
    }
    if (align == ALIGN_RIGHT) {
        return ALIGN_AXIS_RIGHT;
    }
    return ALIGN_AXIS_CENTER;
}

fn baselineCodeToAxis(baseline: u32) -> i32 {
    if (baseline == BASELINE_TOP) {
        return ALIGN_AXIS_LEFT;
    }
    if (baseline == BASELINE_BOTTOM || baseline == BASELINE_ALPHABETIC) {
        return ALIGN_AXIS_RIGHT;
    }
    return ALIGN_AXIS_CENTER;
}

// Align adjustment for ranged text when rotated.
fn fixAlignForAngle(align: vec2<i32>, angleInDegrees: f32) -> vec2<i32> {
    let a = (angleInDegrees + 45.0) % 360.0;
    let x = align.x;
    let y = -align.y;

    if (a < 90.0) {
        return vec2<i32>(x, y);
    } else if (a < 180.0) {
        return vec2<i32>(y, -x);
    } else if (a < 270.0) {
        return vec2<i32>(-x, y);
    }
    return vec2<i32>(-y, x);
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    if (!isInstanceVisible(i) || !isPlacementVisible(i)) {
        return culledText();
    }

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
    let metrics = glyphMetrics[glyph.glyphId];

    // Base font size before range fitting.
    var size = getScaled_size(i);
    var opacity = getScaled_opacity(i);

    // Rotation is applied both to range fitting and glyph placement.
    let angleDegrees = getScaled_angle(i);
    let angle = angleDegrees * 3.14159265 / 180.0;
    let sinTheta = sin(angle);
    let cosTheta = cos(angle);
    let rot = mat2x2<f32>(cosTheta, sinTheta, -sinTheta, cosTheta);

    // Text dimensions at the layout font size, scaled to the current size.
    let sizeRatioBase = size / params.uLayoutFontSize;
    let textSize = vec2<f32>(textMetrics.width, textMetrics.height) * sizeRatioBase;
    let flushSize = calculateRotatedDimensions(textSize, rot);

    // Resolve alignment axes for ranged fitting.
    var alignAxis = vec2<i32>(
        alignCodeToAxis(u32(getScaled_align(i))),
        baselineCodeToAxis(u32(getScaled_baseline(i)))
    );

#if defined(x2_DEFINED) || defined(y2_DEFINED)
    alignAxis = fixAlignForAngle(alignAxis, angleDegrees);
#endif

    // Anchor and ranged endpoints are in the configuration rectangle's local
    // pixel space. Apply the per-instance placement before fitting so that
    // faceted text uses the actual sample-row range, like the WebGL mark.
    let anchorPosition = vec2<f32>(getScaled_x(i), getScaled_y(i));
    // Core's applyOffset subtracts yOffset because unit y points upward. This
    // shader uses local pixel coordinates, where y points downward, so the
    // equivalent offset is positive here.
    let positionOffset = vec2<f32>(
        getScaled_xOffset(i),
        getScaled_yOffset(i)
    );
    var anchor = applyPlacementPixel(anchorPosition, i) + positionOffset;
    var rangeScale = 1.0;
    var logoSize = vec2<f32>(size);

#if defined(x2_DEFINED)
    let x2 = applyPlacementPixel(
        vec2<f32>(getScaled_x2(i), anchorPosition.y),
        i
    ).x + getScaled_x2Offset(i);
    if (params.uLogoLetters != 0u) {
        logoSize.x = abs(x2 - anchor.x);
    } else {
        let xRange = positionInsideRange(
            min(anchor.x, x2),
            max(anchor.x, x2),
            flushSize.x * rangeScale,
            params.uPaddingX,
            alignAxis.x,
            params.uFlushX != 0u,
            params.uViewport.z - params.uViewport.x
        );
        anchor.x = xRange.pos;
        rangeScale = rangeScale * xRange.scale;
    }
#endif

#if defined(y2_DEFINED)
    let y2 = applyPlacementPixel(
        vec2<f32>(anchorPosition.x, getScaled_y2(i)),
        i
    ).y + getScaled_y2Offset(i);
    if (params.uLogoLetters != 0u) {
        logoSize.y = abs(y2 - anchor.y);
        anchor.y = (anchor.y + y2) * 0.5;
    } else {
        let yRange = positionInsideRange(
            min(anchor.y, y2),
            max(anchor.y, y2),
            flushSize.y * rangeScale,
            params.uPaddingY,
            alignAxis.y,
            params.uFlushY != 0u,
            params.uViewport.w - params.uViewport.y
        );
        anchor.y = yRange.pos;
        rangeScale = rangeScale * yRange.scale;
    }
#endif

    // Range fitting uses viewport-local pixels. Add the configuration
    // rectangle's origin only for final placement and visible-range culling.
    // Source-backed draws use a zero-origin configuration rectangle and rely
    // on the GPU viewport for their canvas offset.
    let localAnchor = anchor;
    anchor = params.uViewport.xy + anchor;

    if (isOutsideVisibleRange(anchor)) {
        return culledText();
    }

    // Optional squeeze: scale down text or drop it if it no longer fits.
    if (rangeScale < 1.0) {
        if (params.uSqueeze != 0u) {
            let scaleFadeExtent = vec2<f32>(3.0, 6.0) / vec2<f32>(size);
            if (rangeScale < scaleFadeExtent.x) {
                return culledText();
            }
            size = size * rangeScale;
            opacity = opacity * linearstep(
                scaleFadeExtent.x,
                scaleFadeExtent.y,
                rangeScale
            );
        } else {
            return culledText();
        }
    }

    // Recompute size-dependent scales after range fitting.
    let sizeScale = size / params.uFontBase;
    let sizeRatio = size / params.uLayoutFontSize;

    let local = quad[v];
    var width = metrics.texRect.z * sizeScale;
    var height = metrics.texRect.w * sizeScale;
    var x = alignOffset(u32(getScaled_align(i)), textMetrics.width * sizeRatio) +
        glyph.xOffset * sizeRatio;
    var y = glyphVertexY(
        local.y,
        glyph.yOffset,
        metrics.texRect.w,
        metrics.metrics.x,
        sizeScale,
        sizeRatio,
        u32(getScaled_baseline(i)),
        params.uSdfPadding,
        params.uCapHeight,
        params.uDescent
    );
    if (params.uLogoLetters != 0u) {
        width = logoSize.x * 0.5 *
            (metrics.texRect.z + 2.0 * params.uSdfPadding) /
            metrics.texRect.z;
        height = logoSize.y *
            (metrics.texRect.w + 2.0 * params.uSdfPadding) /
            metrics.texRect.w;
        x = (local.x - 0.5) * width;
        y = (local.y - 0.5) * height;
    }
    // Core encodes dy as a negative y-up glyph offset. Convert it to the
    // screen-pixel direction before applying the screen-space rotation.
    let localPos = vec2<f32>(
        x + local.x * width + getScaled_dx(i),
        y + getScaled_dy(i)
    );
    let rotated = rot * localPos;
    let localPixel = localAnchor + rotated;
    let pixel = anchor + rotated;

    var edgeFadeOpacity = 1.0;
    if (maxValue(params.uViewportEdgeFadeDistance) > -1e10) {
        let viewportSize = params.uViewport.zw - params.uViewport.xy;
        edgeFadeOpacity = minValue(
            ((vec4<f32>(1.0, 1.0, 0.0, 0.0) +
                vec4<f32>(-1.0, -1.0, 1.0, 1.0) * localPixel.yxyx) *
                viewportSize.yxyx - params.uViewportEdgeFadeDistance) /
                params.uViewportEdgeFadeWidth
        );
    }

    let clip = vec2<f32>(
        (pixel.x / globals.width) * 2.0 - 1.0,
        1.0 - (pixel.y / globals.height) * 2.0
    );

    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = placementClipBounds(i);
#endif
    out.pos = vec4<f32>(
        applyTextPlacementClip(clip, i),
        0.0,
        1.0
    );
    out.uv = (metrics.texRect.xy + local * metrics.texRect.zw) * params.uAtlasScale;
    out.color = getScaled_fill(i);
    out.opacity = opacity;
    out.slope = max(1.0, size / params.uSdfNumerator * globals.dpr);
    out.gamma = getGammaForColor(out.color.rgb);
    out.pickId = 0u;
    out.edgeFadeOpacity = edgeFadeOpacity;
#if defined(uniqueId_DEFINED)
    out.pickId = getScaled_uniqueId(i) + 1u;
#endif
    return out;
}

fn median(r: f32, g: f32, b: f32) -> f32 {
    return max(min(r, g), min(max(r, g), b));
}

fn sampleSdf(uv: vec2<f32>) -> f32 {
    let c = textureSample(fontAtlas, fontSampler, uv).rgb;
    return 1.0 - median(c.r, c.g, c.b);
}

fn sampleSuperSdf(uv: vec2<f32>) -> f32 {
    let dx = dpdx(uv);
    // WebGL derivatives use a bottom-left framebuffer origin, whereas WebGPU
    // derivatives use a top-left origin. Preserve the WebGL atlas offsets.
    let dy = -dpdy(uv);
    return (
        sampleSdf(uv + 0.25 * dx + 0.25 * dy) +
        sampleSdf(uv + 0.75 * dx + 0.25 * dy) +
        sampleSdf(uv + 0.25 * dx + 0.75 * dy) +
        sampleSdf(uv + 0.75 * dx + 0.75 * dy)
    ) * 0.25;
}

fn getGammaForColor(rgb: vec3<f32>) -> f32 {
    return mix(
        1.25,
        0.75,
        smoothstep(0.0, 1.0, dot(rgb, vec3<f32>(0.299, 0.587, 0.114)))
    );
}

fn shadeBase(in: VSOut, edgeFadeOpacity: f32) -> vec4<f32> {
    let sigDist = sampleSuperSdf(in.uv);
    var slope = in.slope;
    if (params.uLogoLetters != 0u) {
        slope = 0.7 / length(vec2<f32>(dpdy(sigDist), dpdx(sigDist)));
    }
    var alpha = clamp((sigDist - 0.5) * slope + 0.5, 0.0, 1.0);
    alpha = alpha * edgeFadeOpacity;
    alpha = pow(alpha, in.gamma);
    let color = vec4<f32>(in.color.rgb, in.color.a * in.opacity);
    return premultiplyAlpha(color) * alpha;
}

// Picking intentionally ignores edge fading, like the WebGL renderer.
fn shade(in: VSOut) -> vec4<f32> {
    return shadeBase(in, 1.0);
}

fn shadeText(in: VSOut) -> vec4<f32> {
    return shadeBase(in, clamp(in.edgeFadeOpacity, 0.0, 1.0));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
#if defined(PLACEMENT_ENABLED)
    if (!isInsidePlacementClip(in.pos, in.placementClip)) { discard; }
#endif
    return shadeText(in);
}
`;

/**
 * @typedef {object} TextConfigInput
 * @prop {TextChannels} [channels]
 * @prop {number} [count]
 * @prop {unknown} [textLayout]
 * @prop {unknown} [font]
 * @prop {{metrics: unknown, bitmap: string | ImageBitmap}} [fontResource]
 * @prop {unknown} [fontStyle]
 * @prop {unknown} [fontWeight]
 * @prop {unknown} [fontSize]
 * @prop {unknown} [lineHeight]
 * @prop {unknown} [letterSpacing]
 * @prop {unknown} [logoLetters]
 * @prop {[number, number, number, number]} [viewport]
 * @prop {[number, number, number, number]} [viewportEdgeFadeWidth]
 * @prop {[number, number, number, number]} [viewportEdgeFadeDistance]
 */

/**
 * @param {TextConfigInput} [params]
 * @returns {{ normalized: { channels: Record<string, ChannelConfigInput>, count: number, seriesIndexExpression: string }, textLayout: import("../../fonts/layout.js").TextLayout, fontEntry: FontEntry, fontManager: BmFontManager }}
 */
function normalizeTextConfig({
    channels = {},
    count,
    textLayout,
    font,
    fontResource,
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
    if (fontResource) {
        fontManager.registerFont({
            family: typeof font === "string" ? font : "Lato",
            style: resolvedStyle,
            weight: resolvedWeight,
            metrics:
                /** @type {import("../../fonts/bmFontMetrics.js").BMFontMetrics} */ (
                    fontResource.metrics
                ),
            bitmap: fontResource.bitmap,
        });
    }
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
    let strings;

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
            value: 0,
            type: "u32",
            components: 1,
            scale: { type: "identity" },
        };
        return {
            normalized: {
                channels: /** @type {Record<string, ChannelConfigInput>} */ (
                    normalizedChannels
                ),
                count: stringCount,
                seriesIndexExpression: "glyphs[i].stringIndex",
            },
            textLayout: layout,
            fontEntry,
            fontManager,
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

    const layout = buildConfiguredTextLayout(strings, {
        fontManager,
        font,
        fontStyle,
        fontWeight,
        fontSize,
        lineHeight,
        letterSpacing,
    });
    normalizedChannels.text = {
        value: 0,
        type: "u32",
        components: 1,
        scale: { type: "identity" },
    };

    return {
        normalized: {
            channels: /** @type {Record<string, ChannelConfigInput>} */ (
                normalizedChannels
            ),
            count: strings.length,
            seriesIndexExpression: "glyphs[i].stringIndex",
        },
        textLayout: layout,
        fontEntry,
        fontManager,
    };
}

/**
 * @param {string[]} strings
 * @param {object} options
 * @param {BmFontManager} options.fontManager
 * @param {unknown} [options.font]
 * @param {unknown} [options.fontStyle]
 * @param {unknown} [options.fontWeight]
 * @param {unknown} [options.fontSize]
 * @param {unknown} [options.lineHeight]
 * @param {unknown} [options.letterSpacing]
 */
function buildConfiguredTextLayout(
    strings,
    {
        fontManager,
        font,
        fontStyle,
        fontWeight,
        fontSize,
        lineHeight,
        letterSpacing,
    }
) {
    const resolvedStyle = fontStyle === "italic" ? "italic" : "normal";
    const resolvedWeight =
        typeof fontWeight === "number" || typeof fontWeight === "string"
            ? /** @type {FontWeightInput} */ (fontWeight)
            : 400;
    return buildTextLayout({
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
}

export default class TextProgram extends BaseProgram {
    get propertySlotDefinitions() {
        return {
            viewport: {
                uniform: "uViewport",
                getDefault: () => [
                    0,
                    0,
                    this.renderer._globals.width,
                    this.renderer._globals.height,
                ],
            },
            viewportEdgeFadeWidth: {
                uniform: "uViewportEdgeFadeWidth",
                default: [0, 0, 0, 0],
            },
            viewportEdgeFadeDistance: {
                uniform: "uViewportEdgeFadeDistance",
                default: [-Infinity, -Infinity, -Infinity, -Infinity],
            },
            paddingX: { uniform: "uPaddingX", default: 0 },
            paddingY: { uniform: "uPaddingY", default: 0 },
            flushX: {
                uniform: "uFlushX",
                default: true,
                encode: (/** @type {boolean} */ value) => (value ? 1 : 0),
            },
            flushY: {
                uniform: "uFlushY",
                default: true,
                encode: (/** @type {boolean} */ value) => (value ? 1 : 0),
            },
            squeeze: {
                uniform: "uSqueeze",
                default: true,
                encode: (/** @type {boolean} */ value) => (value ? 1 : 0),
            },
            logoLetters: {
                default: false,
                set: (/** @type {boolean} */ value) => {
                    this._setUniformValue("uLogoLetters", value ? 1 : 0);
                    this._setUniformValue(
                        "uSdfNumerator",
                        this._sdfNumeratorBase * (value ? 0.5 : 1)
                    );
                },
            },
        };
    }

    _initializeExtraUniforms() {
        initializePropertySlots(this, this.propertySlotDefinitions);
    }

    /**
     * @param {import("../../renderer.js").Renderer} renderer
     * @param {import("../../index.js").MarkConfig<"text">} config
     */
    constructor(renderer, config) {
        const { normalized, textLayout, fontEntry, fontManager } =
            normalizeTextConfig(config);
        super(renderer, {
            ...config,
            ...normalized,
            textLayout,
            fontEntry,
        });
        let seriesCount;
        try {
            seriesCount = this._seriesBuffers.inferCount();
        } catch (error) {
            this.destroy();
            throw error;
        }
        if (seriesCount !== null && seriesCount !== normalized.count) {
            this.destroy();
            throw new Error(
                `Text series data count (${seriesCount}) does not match text count (${normalized.count}).`
            );
        }
        this._glyphOffsets = buildGlyphOffsets(textLayout);
        this._fontManager = fontManager;
        delete this._markConfig.textLayout;
        delete this._markConfig.fontEntry;
    }

    /**
     * Text draw ranges address logical strings, not expanded glyph instances.
     *
     * @returns {number}
     */
    get drawCount() {
        return this._glyphOffsets.length - 1;
    }

    /**
     * @param {number} firstInstance
     * @param {number} instanceCount
     * @returns {{ firstInstance: number, instanceCount: number }}
     */
    resolveDrawRange(firstInstance, instanceCount) {
        const firstGlyph = this._glyphOffsets[firstInstance];
        const lastGlyph = this._glyphOffsets[firstInstance + instanceCount];
        return {
            firstInstance: firstGlyph,
            instanceCount: lastGlyph - firstGlyph,
        };
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
            { name: "uPaddingX", type: "f32", components: 1 },
            { name: "uPaddingY", type: "f32", components: 1 },
            { name: "uFlushX", type: "u32", components: 1 },
            { name: "uFlushY", type: "u32", components: 1 },
            { name: "uSqueeze", type: "u32", components: 1 },
            { name: "uLogoLetters", type: "u32", components: 1 },
            { name: "uViewport", type: "f32", components: 4 },
            {
                name: "uViewportEdgeFadeWidth",
                type: "f32",
                components: 4,
            },
            {
                name: "uViewportEdgeFadeDistance",
                type: "f32",
                components: 4,
            },
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
        /** @type {number} */
        this._sdfNumeratorBase = metrics.common.base * 0.35;
        this._updateTextLayoutBuffers(layout);

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

        void this._uploadFontAtlas(fontEntry.bitmap);
    }

    /**
     * @param {import("../../fonts/layout.js").TextLayout} layout
     * @returns {void}
     */
    _updateTextLayoutBuffers(layout) {
        const glyphCount = layout.glyphIds.length;
        const glyphData = new ArrayBuffer(glyphCount * 16);
        const glyphU32 = new Uint32Array(glyphData);
        const glyphF32 = new Float32Array(glyphData);
        for (let i = 0; i < glyphCount; i++) {
            const base = i * 4;
            glyphU32[base] = layout.stringIndex[i];
            glyphU32[base + 1] = layout.glyphIds[i];
            glyphF32[base + 2] = layout.xOffset[i];
            glyphF32[base + 3] = layout.yOffset ? layout.yOffset[i] : 0;
        }
        this._writeExtraBuffer("glyphs", glyphData);

        const stringCount = layout.textWidth.length;
        const stringData = new Float32Array(stringCount * 2);
        for (let i = 0; i < stringCount; i++) {
            const base = i * 2;
            stringData[base] = layout.textWidth[i];
            stringData[base + 1] = layout.textHeight[i];
        }
        this._writeExtraBuffer("stringMetrics", stringData);
    }

    /**
     * @param {string} name
     * @param {ArrayBuffer | ArrayBufferView} data
     * @returns {void}
     */
    _writeExtraBuffer(name, data) {
        const byteLength = data.byteLength;
        const requiredSize = Math.max(4, byteLength);
        let buffer = this._extraBuffers.get(name);
        if (!buffer || buffer.size < requiredSize) {
            buffer?.destroy();
            buffer = this.device.createBuffer({
                size: requiredSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this._extraBuffers.set(name, buffer);
        }
        if (byteLength > 0) {
            this.device.queue.writeBuffer(
                buffer,
                0,
                ArrayBuffer.isView(data) ? asGpuBufferSource(data) : data
            );
        }
    }

    /**
     * @param {string | ImageBitmap} bitmap
     * @returns {Promise<void>}
     */
    async _uploadFontAtlas(bitmap) {
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

        try {
            this._setAtlasFromBitmap(await fetchBmFontBitmap(bitmap));
            return;
        } catch {
            // Fall back to the browser image loader for environments without
            // fetch/CORS support for the atlas URL.
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
        if (this._destroyed) {
            return;
        }
        const texture = this.device.createTexture({
            size: {
                width: image.width,
                height: image.height,
                depthOrArrayLayers: 1,
            },
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.device.queue.copyExternalImageToTexture(
            { source: image },
            { texture },
            { width: image.width, height: image.height }
        );
        const entry = this._extraTextures.get("fontAtlas");
        if (entry) {
            entry.texture.destroy();
            entry.texture = texture;
            entry.width = image.width;
            entry.height = image.height;
            entry.format = "rgba8unorm";
        }
        if (this._bindGroupLayout) {
            this._rebuildBindGroup();
        }
        this.renderer._invalidate();
    }

    /**
     * Rebuild logical string layout and replace all per-string series
     * as a complete set while retaining the mark pipeline and font atlas.
     *
     * @param {import("../../index.d.ts").TextSeries} channels
     * @param {number} [count]
     * @returns {void}
     */
    replaceSeries(channels, count) {
        const text = channels.text;
        /** @type {string[]} */
        let strings;
        if (typeof text === "string") {
            if (count === undefined) {
                throw new Error(
                    "Replacing a scalar text series requires an explicit count."
                );
            }
            strings = Array.from({ length: count }, () => text);
        } else if (Array.isArray(text)) {
            strings = text;
            if (count !== undefined && count !== strings.length) {
                throw new Error(
                    `Text series count (${strings.length}) does not match count (${count}).`
                );
            }
        } else {
            throw new Error(
                'Text series replacement requires a string or string[] "text" channel.'
            );
        }

        const layout = buildConfiguredTextLayout(strings, {
            fontManager: this._fontManager,
            font: this._markConfig.font,
            fontStyle: this._markConfig.fontStyle,
            fontWeight: this._markConfig.fontWeight,
            fontSize: this._markConfig.fontSize,
            lineHeight: this._markConfig.lineHeight,
            letterSpacing: this._markConfig.letterSpacing,
        });
        /** @type {Record<string, import("../../index.js").TypedArray>} */
        const resolved = {};
        for (const [name, targets] of this._logicalSeriesTargets) {
            if (targets.length > 1) {
                throw new Error(
                    `Series replacement for channel "${name}" is not supported because it has multiple series-backed branches.`
                );
            }
            const data = channels[name];
            if (data === undefined) {
                throw new Error(
                    `Series replacement is missing channel "${name}".`
                );
            }
            resolved[targets[0]] =
                /** @type {import("../../index.js").TypedArray} */ (data);
        }
        const seriesCount = this._seriesBuffers.inferCount(resolved);
        if (seriesCount !== null && seriesCount !== strings.length) {
            throw new Error(
                `Text series data count (${seriesCount}) does not match text count (${strings.length}).`
            );
        }
        this._glyphOffsets = buildGlyphOffsets(layout);
        this._updateTextLayoutBuffers(layout);
        this.updateSeries(resolved, strings.length);
    }
}

/**
 * Build an exclusive prefix sum from logical strings to glyph instances.
 *
 * @param {import("../../fonts/layout.js").TextLayout} textLayout
 * @returns {Uint32Array}
 */
function buildGlyphOffsets(textLayout) {
    const offsets = new Uint32Array(textLayout.textWidth.length + 1);
    for (const stringIndex of textLayout.stringIndex) {
        offsets[stringIndex + 1]++;
    }
    for (let i = 1; i < offsets.length; i++) {
        offsets[i] += offsets[i - 1];
    }
    return offsets;
}
