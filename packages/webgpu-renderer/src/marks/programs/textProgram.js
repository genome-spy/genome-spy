import BaseProgram from "./internal/baseProgram.js";
import { initializePropertySlots } from "./internal/propertySlots.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";
import { linearScale } from "../../scales/linear.js";
import { buildTextLayout } from "../../fonts/layout.js";
import {
    buildOutlineTextLayout,
    isTrueTypeFont,
    OUTLINE_ATLAS_OPTIONS,
} from "../../fonts/outlineTextLayout.js";
import { getOutlineFontAtlas } from "../../fonts/outlineFontAtlas.js";
import BmFontManager, { fetchBmFontBitmap } from "../../fonts/bmFontManager.js";
import { SDF_PADDING } from "../../fonts/bmFontMetrics.js";
import {
    asGpuBufferSource,
    writeTextureData,
} from "../../utils/webgpuTextureUtils.js";
import { gpuLabel, RENDERER_GPU_OWNER } from "../../utils/gpuLabel.js";
import { TEXT_GEOMETRY_WGSL } from "./textGeometry.wgsl.js";
import {
    buildGlyphOffsets,
    buildTextRenderItems,
    resolveTextEffectLayers,
} from "./textRenderItems.js";

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
 * - Shared font resources:
 *   - fontAtlas, fontSampler, and glyphMetrics are pooled by exact font
 *     resource for the renderer lifetime.
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
 * @typedef {{ glyphMetrics: GPUBuffer, atlas: { texture: GPUTexture, sampler: GPUSampler, width: number, height: number, format: GPUTextureFormat }, upload: (image: ImageBitmap | HTMLImageElement) => void, destroy: () => void }} FontGpuResources
 * @typedef {{ enabled: boolean, shadow: boolean, outline: boolean }} TextEffects
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
    stroke: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    opacity: { type: "f32", components: 1, default: 1.0 },
    strokeOpacity: { type: "f32", components: 1, default: 1.0 },
    strokeWidth: { type: "f32", components: 1, default: 0.0 },
    shadowColor: { type: "f32", components: 4, optional: true },
    shadowOpacity: { type: "f32", components: 1, optional: true },
    shadowOffsetX: { type: "f32", components: 1, optional: true },
    shadowOffsetY: { type: "f32", components: 1, optional: true },
    shadowBlur: { type: "f32", components: 1, optional: true },
};

const {
    channels: CHANNELS,
    defaults: DEFAULTS,
    defaultConfigs: DEFAULT_CHANNEL_CONFIGS,
    optionalChannels: OPTIONAL_CHANNELS,
} = buildChannelMaps(TEXT_CHANNEL_SPECS);

/**
 * @param {{ enabled: boolean, shadow: boolean, outline: boolean }} effects
 * @returns {string}
 */
function createTextShaderBody(effects) {
    const glyphLookup = effects.enabled
        ? /* wgsl */ `
    let renderItem = renderItems[i];
    let layer = renderItem.layer;
    let glyph = glyphs[renderItem.glyphIndex];`
        : /* wgsl */ `
    let layer = TEXT_LAYER_FILL;
    let glyph = glyphs[i];`;
    const effectSetup = effects.enabled
        ? /* wgsl */ `
    var layerColor = getScaled_fill(i);
    var layerOpacityMultiplier = 1.0;
    var layerExtent = 0.0;
    var effectOffset = vec2<f32>(0.0);
${
    effects.outline
        ? /* wgsl */ `    if (layer == TEXT_LAYER_OUTLINE) {
        layerColor = getScaled_stroke(i);
        layerOpacityMultiplier = getScaled_strokeOpacity(i);
        layerExtent = max(getScaled_strokeWidth(i), 0.0) * 0.5 * globals.dpr;
    }`
        : ""
}
${
    effects.shadow
        ? /* wgsl */ `    if (layer == TEXT_LAYER_SHADOW) {
        layerColor = getScaled_shadowColor(i);
        layerOpacityMultiplier = getScaled_shadowOpacity(i);
        layerExtent = max(getScaled_shadowBlur(i), 0.0) * globals.dpr;
        effectOffset = vec2<f32>(
            getScaled_shadowOffsetX(i),
            getScaled_shadowOffsetY(i)
        );
    }`
        : ""
}
    if (layerColor.a <= 0.0 || opacity * layerOpacityMultiplier <= 0.0 ||
            (layer == TEXT_LAYER_OUTLINE && layerExtent <= 0.0)) {
        return culledText();
    }`
        : /* wgsl */ `
    let layerColor = getScaled_fill(i);
    let layerOpacityMultiplier = 1.0;
    let layerExtent = getScaled_strokeWidth(i) * 0.5 * globals.dpr;
    let effectOffset = vec2<f32>(0.0);`;
    const pickAssignment = effects.enabled
        ? /* wgsl */ `
    if (layer == TEXT_LAYER_FILL) {
        out.pickId = getScaled_uniqueId(i) + 1u;
    }`
        : /* wgsl */ `
    out.pickId = getScaled_uniqueId(i) + 1u;`;
    const outlineShading = effects.enabled
        ? /* wgsl */ `
        let uvDx = dpdx(in.uv);
        let uvDy = -dpdy(in.uv);
        let tileDx = dpdx(in.tilePosition);
        let tileDy = -dpdy(in.tilePosition);
        let outlineCoverage = sampleSuperOutline(
            in,
            uvDx,
            uvDy,
            tileDx,
            tileDy
        );
        var coverage = select(
            outlineCoverage.x,
            outlineCoverage.y,
            in.layer == TEXT_LAYER_OUTLINE
        );
${
    effects.shadow
        ? /* wgsl */ `        let shadowCoverage = sampleSuperShadow(in, uvDx, uvDy);
        coverage = select(
            coverage,
            shadowCoverage,
            in.layer == TEXT_LAYER_SHADOW
        );`
        : ""
}
        coverage = pow(coverage, getGammaForColor(in.color.rgb));
        let color = vec4<f32>(in.color.rgb, in.color.a * in.opacity);
        return premultiplyAlpha(color) * coverage * edgeFadeOpacity;`
        : /* wgsl */ `
        let uvDx = dpdx(in.uv);
        let uvDy = -dpdy(in.uv);
        let tileDx = dpdx(in.tilePosition);
        let tileDy = -dpdy(in.tilePosition);
        let coverage = sampleSuperOutline(
            in,
            uvDx,
            uvDy,
            tileDx,
            tileDy
        );
        var fillColor = in.color;
        var strokeColor = in.stroke;
        let fillCoverage = pow(
            coverage.x,
            getGammaForColor(fillColor.rgb)
        );
        let strokeCoverage = pow(
            coverage.y,
            getGammaForColor(strokeColor.rgb)
        );
        fillColor.a *= in.opacity;
        strokeColor.a *= in.opacity * in.strokeOpacity;
        fillColor = premultiplyAlpha(fillColor);
        strokeColor = premultiplyAlpha(strokeColor);
        let fillLayer = fillColor * fillCoverage;
        let strokeLayer = strokeColor * strokeCoverage;
        let color = sourceOver(strokeLayer, fillLayer);
        return color * edgeFadeOpacity;`;

    return /* wgsl */ `
struct GlyphInstance {
    stringIndex: u32,
    glyphId: u32,
    xOffset: f32,
    yOffset: f32,
};

struct RenderItem {
    glyphIndex: u32,
    layer: u32,
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

const TEXT_LAYER_SHADOW: u32 = 0u;
const TEXT_LAYER_OUTLINE: u32 = 1u;
const TEXT_LAYER_FILL: u32 = 2u;

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
    @location(7) stroke: vec4<f32>,
    @location(8) strokeOpacity: f32,
    @location(9) halfStrokeWidth: f32,
    @location(10) @interpolate(flat) devicePixelsPerAtlas: f32,
    @location(11) tilePosition: vec2<f32>,
    @location(12) @interpolate(flat) shapeBounds: vec4<f32>,
    @location(13) @interpolate(flat) stemDarkening: f32,
    @location(14) @interpolate(flat) layer: u32,
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
    out.stroke = vec4<f32>(0.0);
    out.strokeOpacity = 0.0;
    out.halfStrokeWidth = 0.0;
    out.devicePixelsPerAtlas = 0.0;
    out.tilePosition = vec2<f32>(0.0);
    out.shapeBounds = vec4<f32>(0.0);
    out.stemDarkening = 0.0;
    out.layer = TEXT_LAYER_FILL;
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

${glyphLookup}
    let textMetrics = stringMetrics[glyph.stringIndex];
    let metrics = glyphMetrics[glyph.glyphId];
    let tileSize = metrics.texRect.zw + select(
        vec2<f32>(0.0),
        vec2<f32>(1.0),
        params.uOutlineFont != 0u
    );

    // Base font size before range fitting.
    var size = getScaled_size(i);
    var opacity = getScaled_opacity(i);
${effectSetup}

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
        anchor.x = (anchor.x + x2) * 0.5;
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
    var width = tileSize.x * sizeScale;
    var height = tileSize.y * sizeScale;
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
        var logoAtlasScale =
            (metrics.texRect.zw + vec2<f32>(2.0 * params.uSdfPadding)) /
            metrics.texRect.zw;
        if (params.uOutlineFont != 0u) {
            logoAtlasScale = metrics.texRect.zw / metrics.metrics.yz;
        }
        width = logoSize.x * logoAtlasScale.x;
        height = logoSize.y * logoAtlasScale.y;
        x = -0.5 * width;
        y = (local.y - 0.5) * height;
    }
    // Core encodes dy as a negative y-up glyph offset. Convert it to the
    // screen-pixel direction before applying the screen-space rotation.
    let localPos = vec2<f32>(
        x + local.x * width + getScaled_dx(i),
        y + getScaled_dy(i)
    );
    let rotated = rot * localPos;
    let localPixel = localAnchor + rotated + effectOffset;
    let pixel = anchor + rotated + effectOffset;

    var edgeFadeOpacity = 1.0;
    if (maxValue(params.uViewportEdgeFadeDistance) > -1e10) {
        let viewportSize = params.uViewport.zw - params.uViewport.xy;
        let localUnit = localPixel / viewportSize;
        edgeFadeOpacity = minValue(
            ((vec4<f32>(1.0, 1.0, 0.0, 0.0) +
                vec4<f32>(-1.0, -1.0, 1.0, 1.0) * localUnit.yxyx) *
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
    out.color = layerColor;
    out.opacity = opacity * layerOpacityMultiplier;
    out.slope = max(1.0, size / params.uSdfNumerator * globals.dpr);
    out.gamma = getGammaForColor(out.color.rgb);
    out.pickId = 0u;
    out.edgeFadeOpacity = edgeFadeOpacity;
    out.stroke = getScaled_stroke(i);
    out.strokeOpacity = getScaled_strokeOpacity(i);
    out.halfStrokeWidth = layerExtent;
    out.devicePixelsPerAtlas = max(
        size * globals.dpr / max(params.uShapePixels, 1.0),
        1.0 / max(params.uSpread, 1.0)
    );
    out.tilePosition = local * tileSize;
    out.shapeBounds = vec4<f32>(
        params.uSpread,
        params.uSpread,
        tileSize.x - params.uSpread,
        tileSize.y - params.uSpread
    );
    out.stemDarkening = 0.0;
    out.layer = layer;
    if (params.uOutlineFont != 0u) {
        out.stemDarkening = freeTypeLikeStemDarkening(size * globals.dpr);
    }
#if defined(uniqueId_DEFINED)
${pickAssignment}
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

fn sampleTrueDistance(uv: vec2<f32>) -> f32 {
    return textureSample(fontAtlas, fontSampler, uv).a;
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

fn freeTypeLikeStemDarkening(deviceFontSize: f32) -> f32 {
    // FreeType's auto-hinter estimates a 0.075 em standard stem when the font
    // provides no better value, then applies a piecewise darkening curve that
    // fades to zero for sufficiently wide stems. We do not analyze hinted stem
    // widths, so use the same fallback estimate and return half of FreeType's
    // width increase as a symmetric signed-distance contour outset.
    let estimatedStemWidth = deviceFontSize * 0.075;
    var widthIncrease: f32;
    if (estimatedStemWidth <= 0.5) {
        widthIncrease = 0.4;
    } else if (estimatedStemWidth < 1.0) {
        widthIncrease = mix(0.4, 0.275, (estimatedStemWidth - 0.5) / 0.5);
    } else if (estimatedStemWidth <= 1.667) {
        widthIncrease = 0.275;
    } else if (estimatedStemWidth < 2.333) {
        widthIncrease = mix(
            0.275,
            0.0,
            (estimatedStemWidth - 1.667) / (2.333 - 1.667)
        );
    } else {
        widthIncrease = 0.0;
    }
    return widthIncrease * 0.5;
}

fn sampleOutlineCoverage(
    uv: vec2<f32>,
    tilePosition: vec2<f32>,
    shapeBounds: vec4<f32>,
    devicePixelsPerAtlas: f32,
    halfStrokeWidth: f32,
    stemDarkening: f32
) -> vec2<f32> {
    let sample = textureSample(fontAtlas, fontSampler, uv).rgb;
    let distance = median(sample.r, sample.g, sample.b) * devicePixelsPerAtlas +
        stemDarkening;
    let aaAtlas = (0.5 + stemDarkening) / devicePixelsPerAtlas + 1.0;
    let fillMin = shapeBounds.xy - vec2<f32>(aaAtlas);
    let fillMax = shapeBounds.zw + vec2<f32>(aaAtlas);
    let strokeAtlas = halfStrokeWidth / devicePixelsPerAtlas;
    let strokeGuard = aaAtlas + 4.0 * strokeAtlas;
    let strokeMin = shapeBounds.xy - vec2<f32>(strokeGuard);
    let strokeMax = shapeBounds.zw + vec2<f32>(strokeGuard);
    let fillInside = all(tilePosition >= fillMin) && all(tilePosition <= fillMax);
    let strokeInside = all(tilePosition >= strokeMin) && all(tilePosition <= strokeMax);
    let fillCoverage = select(
        0.0,
        clamp(distance + 0.5, 0.0, 1.0),
        fillInside
    );
    let outerCoverage = select(
        0.0,
        clamp(distance + halfStrokeWidth + 0.5, 0.0, 1.0),
        strokeInside
    );
    // Use the same guard for both stroke contours so their difference is
    // exactly zero when the requested width is zero.
    return vec2<f32>(
        fillCoverage,
        max(outerCoverage - fillCoverage, 0.0)
    );
}

fn sampleSuperOutline(
    in: VSOut,
    uvDx: vec2<f32>,
    uvDy: vec2<f32>,
    tileDx: vec2<f32>,
    tileDy: vec2<f32>
) -> vec2<f32> {
    return (
        sampleOutlineCoverage(
            in.uv + 0.25 * uvDx + 0.25 * uvDy,
            in.tilePosition + 0.25 * tileDx + 0.25 * tileDy,
            in.shapeBounds,
            in.devicePixelsPerAtlas,
            in.halfStrokeWidth,
            in.stemDarkening
        ) +
        sampleOutlineCoverage(
            in.uv + 0.75 * uvDx + 0.25 * uvDy,
            in.tilePosition + 0.75 * tileDx + 0.25 * tileDy,
            in.shapeBounds,
            in.devicePixelsPerAtlas,
            in.halfStrokeWidth,
            in.stemDarkening
        ) +
        sampleOutlineCoverage(
            in.uv + 0.25 * uvDx + 0.75 * uvDy,
            in.tilePosition + 0.25 * tileDx + 0.75 * tileDy,
            in.shapeBounds,
            in.devicePixelsPerAtlas,
            in.halfStrokeWidth,
            in.stemDarkening
        ) +
        sampleOutlineCoverage(
            in.uv + 0.75 * uvDx + 0.75 * uvDy,
            in.tilePosition + 0.75 * tileDx + 0.75 * tileDy,
            in.shapeBounds,
            in.devicePixelsPerAtlas,
            in.halfStrokeWidth,
            in.stemDarkening
        )
    ) * 0.25;
}

fn shadowCoverageAt(in: VSOut, uv: vec2<f32>) -> f32 {
    let distance = sampleTrueDistance(uv) * in.devicePixelsPerAtlas +
        in.stemDarkening;
    let maxBlur = max(
        (params.uSpread - 1.0) * in.devicePixelsPerAtlas,
        0.0
    );
    let blur = min(in.halfStrokeWidth, maxBlur);
    if (blur <= 0.0) {
        return clamp(distance + 0.5, 0.0, 1.0);
    }
    return smoothstep(-blur, blur, distance);
}

fn sampleSuperShadow(
    in: VSOut,
    uvDx: vec2<f32>,
    uvDy: vec2<f32>
) -> f32 {
    return (
        shadowCoverageAt(in, in.uv + 0.25 * uvDx + 0.25 * uvDy) +
        shadowCoverageAt(in, in.uv + 0.75 * uvDx + 0.25 * uvDy) +
        shadowCoverageAt(in, in.uv + 0.25 * uvDx + 0.75 * uvDy) +
        shadowCoverageAt(in, in.uv + 0.75 * uvDx + 0.75 * uvDy)
    ) * 0.25;
}

fn getGammaForColor(rgb: vec3<f32>) -> f32 {
    return mix(
        1.25,
        0.75,
        smoothstep(0.0, 1.0, dot(rgb, vec3<f32>(0.299, 0.587, 0.114)))
    );
}

fn sourceOver(above: vec4<f32>, below: vec4<f32>) -> vec4<f32> {
    return above + below * (1.0 - above.a);
}

fn shadeBase(in: VSOut, edgeFadeOpacity: f32) -> vec4<f32> {
    if (params.uOutlineFont != 0u) {
${outlineShading}
    }
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
}

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
 * @returns {{ normalized: { channels: Record<string, ChannelConfigInput>, count: number, seriesIndexExpression: string }, textLayout: import("../../fonts/layout.js").TextLayout, fontEntry: FontEntry | null, fontManager: BmFontManager | null, effects: { enabled: boolean, shadow: boolean, outline: boolean } }}
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
    const textChannel = normalizedChannels.text;
    normalizedChannels.text = {
        value: 0,
        type: "u32",
        components: 1,
        scale: { type: "identity" },
    };
    const effects = resolveTextEffectLayers(channels);
    if (effects.enabled && !isTrueTypeFont(font)) {
        throw new Error(
            "Text outlines and shadows require a TrueType outline font."
        );
    }
    if (effects.shadow) {
        normalizedChannels.shadowColor ??= { value: [0, 0, 0, 1] };
        normalizedChannels.shadowOpacity ??= { value: 0 };
        normalizedChannels.shadowOffsetX ??= { value: 0 };
        normalizedChannels.shadowOffsetY ??= { value: 0 };
        normalizedChannels.shadowBlur ??= { value: 0 };
    }
    const seriesIndexExpression = effects.enabled
        ? "glyphs[renderItems[i].glyphIndex].stringIndex"
        : "glyphs[i].stringIndex";
    /**
     * @param {import("../../fonts/layout.js").TextLayout} layout
     * @param {number} resolvedCount
     * @param {FontEntry | null} fontEntry
     * @param {BmFontManager | null} fontManager
     */
    const result = (layout, resolvedCount, fontEntry, fontManager) => ({
        normalized: {
            channels: /** @type {Record<string, ChannelConfigInput>} */ (
                normalizedChannels
            ),
            count: resolvedCount,
            seriesIndexExpression,
        },
        textLayout: layout,
        fontEntry,
        fontManager,
        effects,
    });
    if (isTrueTypeFont(font)) {
        if (textLayout) {
            throw new Error(
                "TrueType text layout is derived from its outline font."
            );
        }
        const strings = resolveTextStrings(textChannel, count);
        const layout = buildResolvedTextLayout(strings, font, null, {
            fontSize,
            lineHeight,
            letterSpacing,
        });
        return result(/** @type {any} */ (layout), strings.length, null, null);
    }
    const fontSpec = resolveBmFontSpec({ font, fontStyle, fontWeight });
    const fontManager = new BmFontManager();
    if (fontResource) {
        fontManager.registerFont({
            ...fontSpec,
            metrics:
                /** @type {import("../../fonts/bmFontMetrics.js").BMFontMetrics} */ (
                    fontResource.metrics
                ),
            bitmap: fontResource.bitmap,
        });
    }
    const fontEntry = fontManager.getFont(
        fontSpec.family,
        fontSpec.style,
        fontSpec.weight
    );
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
        return result(layout, stringCount, fontEntry, fontManager);
    }

    const strings = resolveTextStrings(textChannel, count);
    const layout = buildResolvedTextLayout(strings, font, fontManager, {
        font,
        fontStyle,
        fontWeight,
        fontSize,
        lineHeight,
        letterSpacing,
    });
    return result(layout, strings.length, fontEntry, fontManager);
}

/**
 * @param {string[]} strings
 * @param {unknown} font
 * @param {BmFontManager | null} fontManager
 * @param {TextConfigInput} config
 */
function buildResolvedTextLayout(strings, font, fontManager, config) {
    if (isTrueTypeFont(font)) {
        return buildOutlineTextLayout(strings, font, {
            fontSize:
                typeof config.fontSize === "number" ? config.fontSize : 12,
            lineHeight:
                typeof config.lineHeight === "number" ? config.lineHeight : 1,
            letterSpacing:
                typeof config.letterSpacing === "number"
                    ? config.letterSpacing
                    : 0,
        });
    }
    return buildTextLayout({
        strings,
        fontManager: /** @type {BmFontManager} */ (fontManager),
        font: resolveBmFontSpec(config),
        fontSize: typeof config.fontSize === "number" ? config.fontSize : 12,
        lineHeight:
            typeof config.lineHeight === "number" ? config.lineHeight : 1,
        letterSpacing:
            typeof config.letterSpacing === "number" ? config.letterSpacing : 0,
    });
}

/**
 * @param {Pick<TextConfigInput, "font" | "fontStyle" | "fontWeight">} config
 */
function resolveBmFontSpec({ font, fontStyle, fontWeight }) {
    return {
        family: typeof font === "string" ? font : "Lato",
        style: /** @type {"normal" | "italic"} */ (
            fontStyle === "italic" ? "italic" : "normal"
        ),
        weight:
            typeof fontWeight === "number" || typeof fontWeight === "string"
                ? /** @type {FontWeightInput} */ (fontWeight)
                : 400,
    };
}

/**
 * @param {ChannelConfigInput | TextStringChannelConfigInput | undefined} textChannel
 * @param {number | undefined} count
 * @returns {string[]}
 */
function resolveTextStrings(textChannel, count) {
    if (
        textChannel &&
        "data" in textChannel &&
        textChannel.data !== undefined
    ) {
        if (Array.isArray(textChannel.data)) {
            return /** @type {string[]} */ (textChannel.data);
        }
        throw new Error(
            "Text channel data must be a string array when no textLayout is provided."
        );
    }
    if (
        textChannel &&
        "value" in textChannel &&
        textChannel.value !== undefined
    ) {
        if (typeof textChannel.value !== "string") {
            throw new Error(
                "Text channel value must be a string when no textLayout is provided."
            );
        }
        const value = textChannel.value;
        return Array.from({ length: count ?? 1 }, () => value);
    }
    return Array.from({ length: count ?? 0 }, () => "");
}

/**
 * @param {string | ImageBitmap} bitmap
 * @returns {Promise<ImageBitmap | HTMLImageElement | null>}
 */
async function loadFontBitmap(bitmap) {
    if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap) {
        return bitmap;
    }
    if (typeof bitmap !== "string") {
        return null;
    }
    try {
        return await fetchBmFontBitmap(bitmap);
    } catch {
        // Fall back to the browser image loader for non-fetchable URLs.
    }
    if (typeof Image === "undefined") {
        return null;
    }
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not load font bitmap."));
        image.src = bitmap;
    });
}

/**
 * @param {import("../../renderer.js").Renderer} renderer
 * @param {FontEntry} fontEntry
 * @returns {FontGpuResources}
 */
function getFontGpuResources(renderer, fontEntry) {
    const { metrics, bitmap } = fontEntry;
    let resourcesByBitmap = renderer._fontResourceCache.get(metrics);
    const existing = resourcesByBitmap?.get(bitmap);
    if (existing) {
        return /** @type {FontGpuResources} */ (existing);
    }
    if (!resourcesByBitmap) {
        resourcesByBitmap = new Map();
        renderer._fontResourceCache.set(metrics, resourcesByBitmap);
    }

    const labelOwner = `${RENDERER_GPU_OWNER} font #${renderer._nextFontResourceId++}`;
    const glyphMetricsData = new Float32Array((metrics.maxCharId + 1) * 8);
    for (const glyph of metrics.chars) {
        const base = glyph.id * 8;
        glyphMetricsData[base] = glyph.x;
        glyphMetricsData[base + 1] = glyph.y;
        glyphMetricsData[base + 2] = glyph.width;
        glyphMetricsData[base + 3] = glyph.height;
        glyphMetricsData[base + 4] = glyph.yoffset;
    }
    const glyphMetrics = renderer.device.createBuffer({
        label: gpuLabel(labelOwner, "glyph metrics"),
        size: glyphMetricsData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    let sampler;
    let texture;
    try {
        renderer.device.queue.writeBuffer(glyphMetrics, 0, glyphMetricsData);
        sampler = renderer.device.createSampler({
            label: gpuLabel(labelOwner, "atlas sampler"),
            magFilter: "linear",
            minFilter: "linear",
        });
        texture = renderer.device.createTexture({
            label: gpuLabel(labelOwner, "atlas"),
            size: {
                width: metrics.common.scaleW,
                height: metrics.common.scaleH,
                depthOrArrayLayers: 1,
            },
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const transparentAtlas = new Uint8Array(
            metrics.common.scaleW * metrics.common.scaleH * 4
        );
        transparentAtlas.fill(255);
        writeTextureData(renderer.device, texture, {
            format: "rgba8unorm",
            width: metrics.common.scaleW,
            height: metrics.common.scaleH,
            data: transparentAtlas,
        });
    } catch (error) {
        texture?.destroy();
        glyphMetrics.destroy();
        throw error;
    }

    let destroyed = false;
    /** @type {FontGpuResources} */
    const resources = {
        glyphMetrics,
        atlas: {
            texture,
            sampler,
            width: metrics.common.scaleW,
            height: metrics.common.scaleH,
            format: "rgba8unorm",
        },
        upload(image) {
            if (destroyed || !renderer._isAlive()) {
                return;
            }
            if (
                image.width !== metrics.common.scaleW ||
                image.height !== metrics.common.scaleH
            ) {
                console.warn(
                    `Ignoring ${image.width}x${image.height} font bitmap; expected ${metrics.common.scaleW}x${metrics.common.scaleH}.`
                );
                return;
            }
            renderer.device.queue.copyExternalImageToTexture(
                { source: image },
                { texture },
                { width: image.width, height: image.height }
            );
            renderer._invalidate();
        },
        destroy() {
            if (destroyed) {
                return;
            }
            destroyed = true;
            glyphMetrics.destroy();
            texture.destroy();
        },
    };
    resourcesByBitmap.set(bitmap, resources);
    void loadFontBitmap(bitmap)
        .then((image) => image && resources.upload(image))
        .catch(() => {});
    return resources;
}

/** @param {import("../../fonts/outlineFontAtlas.js").OutlineFontAtlas} atlas */
function outlineAtlasResource(atlas) {
    return {
        texture: atlas.texture,
        sampler: atlas.sampler,
        width: atlas.width,
        height: atlas.height,
        format: /** @type {GPUTextureFormat} */ ("rgba16float"),
    };
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
     * @param {import("../../index.js").MarkProgramCreationContext} [context]
     */
    constructor(renderer, config, context) {
        const { normalized, textLayout, fontEntry, fontManager, effects } =
            normalizeTextConfig(config);
        super(
            renderer,
            {
                ...config,
                ...normalized,
                textLayout,
                fontEntry,
                effects,
            },
            context
        );
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
        return this._drawOffsets.length - 1;
    }

    /**
     * @param {number} firstInstance
     * @param {number} instanceCount
     * @returns {{ firstInstance: number, instanceCount: number }}
     */
    resolveDrawRange(firstInstance, instanceCount) {
        const firstGlyph = this._drawOffsets[firstInstance];
        const lastGlyph = this._drawOffsets[firstInstance + instanceCount];
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
        const effects = this._markConfig?.effects;
        return createTextShaderBody(
            effects
                ? /** @type {TextEffects} */ (effects)
                : { enabled: false, shadow: false, outline: false }
        );
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
            { name: "uOutlineFont", type: "u32", components: 1 },
            { name: "uShapePixels", type: "f32", components: 1 },
            { name: "uSpread", type: "f32", components: 1 },
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
        /** @type {import("../shaders/markShaderBuilder.js").ExtraResourceDef[]} */
        const resources = [
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
        const effects = /** @type {TextEffects} */ (this._markConfig.effects);
        if (effects.enabled) {
            resources.push({
                name: "renderItems",
                role: "extraBuffer",
                kind: "buffer",
                bufferType: "read-only-storage",
                visibility: "vertex",
                wgslName: "renderItems",
                wgslType: "array<RenderItem>",
            });
        }
        return resources;
    }

    _initializeExtraResources() {
        const layout =
            /** @type {import("../../fonts/layout.js").TextLayout} */ (
                this._markConfig.textLayout
            );
        if (isTrueTypeFont(this._markConfig.font)) {
            this._initializeOutlineFontResources(
                /** @type {any} */ (layout),
                this._markConfig.font
            );
        } else {
            const fontEntry = /** @type {FontEntry} */ (
                this._markConfig.fontEntry
            );
            const metrics = fontEntry.metrics;
            this._setUniformValue("uFontBase", metrics.common.base);
            this._setUniformValue("uAtlasScale", [
                1 / metrics.common.scaleW,
                1 / metrics.common.scaleH,
            ]);
            this._setUniformValue("uCapHeight", metrics.capHeight);
            this._setUniformValue("uDescent", metrics.descent);
            this._setUniformValue("uSdfPadding", SDF_PADDING);
            this._setUniformValue("uOutlineFont", 0);
            this._setUniformValue("uShapePixels", 1);
            this._setUniformValue("uSpread", 1);
            /** @type {number} */
            this._sdfNumeratorBase = metrics.common.base * 0.35;

            const resources = getFontGpuResources(this.renderer, fontEntry);
            this._extraBuffers.set("glyphMetrics", resources.glyphMetrics);
            this._extraTextures.set("fontAtlas", resources.atlas);
            this._borrowedExtraBuffers.add("glyphMetrics");
            this._borrowedExtraTextures.add("fontAtlas");
        }
        this._setUniformValue("uLayoutFontSize", layout.fontSize);
        this._updateTextLayoutBuffers(layout);
    }

    /**
     * @param {import("../../fonts/layout.js").TextLayout & { outlineGlyphs: { glyphId: number, path: string, bounds: import("../../fonts/trueTypeFont.js").TrueTypeBounds, tileWidth: number, tileHeight: number }[] }} layout
     * @param {import("../../fonts/trueTypeFont.js").TrueTypeFont} font
     */
    _initializeOutlineFontResources(layout, font) {
        const atlas = getOutlineFontAtlas(this.renderer, font);
        this._updateOutlineGlyphMetrics(layout, font, atlas);
        const shapePixels =
            OUTLINE_ATLAS_OPTIONS.tileSize -
            OUTLINE_ATLAS_OPTIONS.shapePadding * 2;
        const atlasScale = shapePixels / font.unitsPerEm;

        this._setUniformValue("uFontBase", shapePixels);
        this._setUniformValue("uAtlasScale", [
            1 / atlas.width,
            1 / atlas.height,
        ]);
        this._setUniformValue("uCapHeight", font.capHeight * atlasScale);
        // TrueType descenders are signed, but baselineOffset expects the
        // positive distance from the alphabetic baseline to the font bottom.
        this._setUniformValue("uDescent", -font.descender * atlasScale);
        this._setUniformValue("uSdfPadding", 0);
        this._setUniformValue("uOutlineFont", 1);
        this._setUniformValue("uShapePixels", shapePixels);
        this._setUniformValue("uSpread", OUTLINE_ATLAS_OPTIONS.spread);
        this._sdfNumeratorBase = shapePixels * 0.35;
        this._extraTextures.set("fontAtlas", outlineAtlasResource(atlas));
        this._borrowedExtraTextures.add("fontAtlas");
        this._outlineAtlas = atlas;
        this._outlineAtlasUnsubscribe = atlas.subscribe((grownAtlas) => {
            this._setUniformValue("uAtlasScale", [
                1 / grownAtlas.width,
                1 / grownAtlas.height,
            ]);
            this._extraTextures.set(
                "fontAtlas",
                outlineAtlasResource(grownAtlas)
            );
            this._writeUniforms();
            this._rebuildBindGroup();
            this.renderer._invalidate();
        });
    }

    /**
     * @param {import("../../fonts/layout.js").TextLayout & { outlineGlyphs: { glyphId: number, path: string, bounds: import("../../fonts/trueTypeFont.js").TrueTypeBounds, tileWidth: number, tileHeight: number }[] }} layout
     * @param {import("../../fonts/trueTypeFont.js").TrueTypeFont} font
     * @param {import("../../fonts/outlineFontAtlas.js").OutlineFontAtlas} atlas
     * @returns {boolean} Whether the metric buffer identity changed.
     */
    _updateOutlineGlyphMetrics(layout, font, atlas) {
        const entries = atlas.ensure(layout.outlineGlyphs);
        const atlasScale =
            (OUTLINE_ATLAS_OPTIONS.tileSize -
                OUTLINE_ATLAS_OPTIONS.shapePadding * 2) /
            font.unitsPerEm;
        const glyphMetrics = new Float32Array(layout.outlineGlyphs.length * 8);
        for (let index = 0; index < layout.outlineGlyphs.length; index++) {
            const metricOffset = index * 8;
            const glyph = layout.outlineGlyphs[index];
            const entry = entries[index];
            glyphMetrics[metricOffset] = entry.x;
            glyphMetrics[metricOffset + 1] = entry.y;
            glyphMetrics[metricOffset + 2] = entry.width;
            glyphMetrics[metricOffset + 3] = entry.height;
            glyphMetrics[metricOffset + 4] =
                -(glyph.bounds.yMin + glyph.bounds.yMax) * 0.5 * atlasScale -
                glyph.tileHeight * 0.5;
            // Logo fitting needs the visible outline size separately from the
            // padded atlas tile represented by texRect.
            glyphMetrics[metricOffset + 5] =
                (glyph.bounds.xMax - glyph.bounds.xMin) * atlasScale;
            glyphMetrics[metricOffset + 6] =
                (glyph.bounds.yMax - glyph.bounds.yMin) * atlasScale;
        }
        return this._writeExtraBuffer("glyphMetrics", glyphMetrics);
    }

    /**
     * @param {import("../../fonts/layout.js").TextLayout} layout
     * @returns {boolean} Whether a bound buffer identity changed.
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
        let changed = this._writeExtraBuffer("glyphs", glyphData);

        const stringCount = layout.textWidth.length;
        const stringData = new Float32Array(stringCount * 2);
        for (let i = 0; i < stringCount; i++) {
            const base = i * 2;
            stringData[base] = layout.textWidth[i];
            stringData[base + 1] = layout.textHeight[i];
        }
        changed =
            this._writeExtraBuffer("stringMetrics", stringData) || changed;
        const effects = /** @type {TextEffects} */ (this._markConfig.effects);
        if (effects.enabled) {
            const renderItems = buildTextRenderItems(layout, effects);
            changed =
                this._writeExtraBuffer("renderItems", renderItems.data) ||
                changed;
            this._drawOffsets = renderItems.offsets;
        } else {
            this._drawOffsets = buildGlyphOffsets(layout);
        }
        return changed;
    }

    /**
     * @param {string} name
     * @param {ArrayBuffer | ArrayBufferView} data
     * @returns {boolean} Whether the buffer identity changed.
     */
    _writeExtraBuffer(name, data) {
        const byteLength = data.byteLength;
        const requiredSize = Math.max(4, byteLength);
        let buffer = this._extraBuffers.get(name);
        const changed = !buffer || buffer.size < requiredSize;
        if (changed) {
            buffer?.destroy();
            buffer = this.device.createBuffer({
                label: gpuLabel(this.label, name),
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
        return changed;
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

        const outlineFont = isTrueTypeFont(this._markConfig.font)
            ? this._markConfig.font
            : null;
        const layout = buildResolvedTextLayout(
            strings,
            this._markConfig.font,
            this._fontManager,
            this._markConfig
        );
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
        let textBuffersChanged = this._updateTextLayoutBuffers(layout);
        if (outlineFont) {
            textBuffersChanged =
                this._updateOutlineGlyphMetrics(
                    /** @type {any} */ (layout),
                    outlineFont,
                    this._outlineAtlas
                ) || textBuffersChanged;
        }
        this.updateSeries(resolved, strings.length, textBuffersChanged);
    }

    destroy() {
        this._outlineAtlasUnsubscribe?.();
        super.destroy();
    }
}
