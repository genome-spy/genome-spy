import {
    POSITION_CLAMP_CHANNEL_SPECS,
    POSITION_CLAMP_WGSL,
} from "./positionClamping.js";
import BaseProgram from "./internal/baseProgram.js";
import { initializePropertySlots } from "./internal/propertySlots.js";
import { linearScale } from "../../scales/linear.js";
import {
    buildOutlineTextLayout,
    isTrueTypeFont,
    OUTLINE_ATLAS_OPTIONS,
} from "../../fonts/outlineTextLayout.js";
import { getOutlineFontAtlas } from "../../fonts/outlineFontAtlas.js";
import { asGpuBufferSource } from "../../utils/webgpuTextureUtils.js";
import { gpuLabel } from "../../utils/gpuLabel.js";
import { buildTextGlyphLookup } from "./textGlyphLookup.js";
import { TEXT_GEOMETRY_WGSL } from "./textGeometry.wgsl.js";
import { buildTextRenderItems, hasTextShadow } from "./textRenderItems.js";

/**
 * Text keeps channels at logical-string cardinality and lays out glyphs once.
 * The renderer owns shared font atlases and glyph metrics. Per-string metrics
 * include glyph ranges and a layout-space lookup of padded glyph rectangles.
 *
 * Each label schedules its existing glyph shadows followed by one foreground
 * quad. Foreground shading resolves nominal fill and original-glyph stroke
 * bands together, then applies common opacity. The lookup bounds sampling work
 * without per-label textures or passes. Picking retains individual glyph quads.
 */

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 * @typedef {import("../../index.js").TextChannels} TextChannels
 * @typedef {import("../../index.js").TextStringChannelConfigInput} TextStringChannelConfigInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const TEXT_CHANNEL_SPECS = {
    ...POSITION_CLAMP_CHANNEL_SPECS,
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
    fillOpacity: { type: "f32", components: 1, default: 1.0 },
    opacity: { type: "f32", components: 1, default: 1.0 },
    strokeOpacity: { type: "f32", components: 1, default: 1.0 },
    strokeWidth: { type: "f32", components: 1, default: 0.0 },
    shadowColor: { type: "f32", components: 4, optional: true },
    shadowOpacity: { type: "f32", components: 1, optional: true },
    shadowOffsetX: { type: "f32", components: 1, optional: true },
    shadowOffsetY: { type: "f32", components: 1, optional: true },
    shadowBlur: { type: "f32", components: 1, optional: true },
};

/**
 * @param {boolean} shadow
 * @returns {string}
 */
function createTextShaderBody(shadow) {
    const glyphLookup = /* wgsl */ `
    let renderItem = renderItems[i];
    let layer = renderItem.layer;
    let glyph = glyphs[renderItem.glyphIndex];`;
    const effectSetup = /* wgsl */ `
    var layerColor = getScaled_fill(i);
    layerColor.a *= getScaled_fillOpacity(i);
    var layerOpacityMultiplier = 1.0;
    var layerExtent = max(getScaled_strokeWidth(i), 0.0) * globals.dpr;
    var effectOffset = vec2<f32>(0.0);
${
    shadow
        ? /* wgsl */ `
    if (layer == TEXT_LAYER_SHADOW) {
        layerColor = getScaled_shadowColor(i);
        layerOpacityMultiplier = getScaled_shadowOpacity(i);
        layerExtent = max(getScaled_shadowBlur(i), 0.0) * globals.dpr;
        effectOffset = vec2<f32>(getScaled_shadowOffsetX(i), getScaled_shadowOffsetY(i));
    }`
        : ""
}
    if (pickingEnabled && layer != TEXT_LAYER_FOREGROUND) { return culledText(); }
    if (!pickingEnabled && opacity * layerOpacityMultiplier <= 0.0) { return culledText(); }`;
    const pickAssignment = /* wgsl */ `
    if (layer == TEXT_LAYER_FOREGROUND) { out.pickId = getScaled_uniqueId(i) + 1u; }`;
    const foregroundShading = /* wgsl */ `
        let tileDx = dpdx(in.localPosition);
        let tileDy = -dpdy(in.localPosition);
${
    shadow
        ? /* wgsl */ `
        let uvDx = dpdx(in.uv);
        let uvDy = -dpdy(in.uv);
        if (in.layer.x == TEXT_LAYER_SHADOW) {
            let coverage = pow(sampleSuperShadow(in, uvDx, uvDy), getGammaForColor(in.color.rgb));
            return premultiplyAlpha(vec4<f32>(in.color.rgb, in.color.a * in.opacity)) * coverage * edgeFadeOpacity;
        }`
        : ""
}
        return labelPaint(in, tileDx, tileDy) * edgeFadeOpacity;`;

    return /* wgsl */ `
${POSITION_CLAMP_WGSL}
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
    glyphStart: u32,
    glyphEnd: u32,
    lookupStart: u32,
    lookupBins: u32,
    lookupOrigin: f32,
    lookupWidth: f32,
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
const TEXT_LAYER_FOREGROUND: u32 = 1u;

${TEXT_GEOMETRY_WGSL}

struct VSOut {
#if defined(PLACEMENT_ENABLED)
    @location(15) @interpolate(flat) placementClip: vec4<f32>,
#endif
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) opacity: f32,
    @location(3) @interpolate(flat) glyphOffsets: vec2<f32>,
    @location(5) @interpolate(flat) pickId: u32,
    @location(6) localPixel: vec2<f32>,
    @location(7) stroke: vec4<f32>,
    @location(8) strokeOpacity: f32,
    // Physical-pixel outside stroke width or shadow blur.
    @location(9) extent: f32,
    @location(10) @interpolate(flat) devicePixelsPerAtlas: f32,
    @location(11) localPosition: vec2<f32>,
    @location(12) @interpolate(flat) glyphScales: vec4<f32>,
    @location(13) @interpolate(flat) stemDarkening: f32,
    @location(14) @interpolate(flat) layer: vec2<u32>,
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
    out.glyphOffsets = vec2<f32>(0.0);
    out.pickId = 0u;
    out.localPixel = vec2<f32>(0.0);
    out.stroke = vec4<f32>(0.0);
    out.strokeOpacity = 0.0;
    out.extent = 0.0;
    out.devicePixelsPerAtlas = 0.0;
    out.localPosition = vec2<f32>(0.0);
    out.glyphScales = vec4<f32>(0.0);
    out.stemDarkening = 0.0;
    out.layer = vec2<u32>(TEXT_LAYER_FOREGROUND, 0u);
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

// Scales convert atlas/layout units to current pixels; zw holds logo dimensions.
fn labelGlyphRect(
    glyph: GlyphInstance,
    metrics: GlyphMetrics,
    scales: vec4<f32>,
    offsets: vec2<f32>
) -> vec4<f32> {
    // Match the existing glyph quad: X includes its final atlas pixel, Y does not.
    var dimensions = (metrics.texRect.zw + vec2<f32>(1.0, 0.0)) * scales.x;
    var origin = vec2<f32>(
        offsets.x + glyph.xOffset * scales.y,
        offsets.y - glyph.yOffset * scales.y + metrics.metrics.x * scales.x
    );
    if (params.uLogoLetters != 0u) {
        dimensions = scales.zw * metrics.texRect.zw / metrics.metrics.yz;
        origin = -0.5 * dimensions;
    }
    return vec4<f32>(origin, dimensions);
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
    let tileSize = metrics.texRect.zw + vec2<f32>(1.0);

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
    var anchor = clampPlacedPosition(applyPlacementPixel(anchorPosition, i) + positionOffset, i);
    var rangeScale = 1.0;
    var logoSize = vec2<f32>(size);

#if defined(x2_DEFINED)
    let x2 = clampPlacedPosition(applyPlacementPixel(vec2<f32>(getScaled_x2(i), anchorPosition.y), i) + vec2<f32>(getScaled_x2Offset(i), 0.0), i).x;
#if defined(xClampRange_DEFINED)
    if (anchor.x == x2) { return culledText(); }
#endif
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
    let y2 = clampPlacedPosition(applyPlacementPixel(vec2<f32>(anchorPosition.x, getScaled_y2(i)), i) + vec2<f32>(0.0, getScaled_y2Offset(i)), i).y;
#if defined(yClampRange_DEFINED)
    if (anchor.y == y2) { return culledText(); }
#endif
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
        0.0,
        params.uCapHeight,
        params.uDescent
    );
    if (params.uLogoLetters != 0u) {
        let logoAtlasScale = metrics.texRect.zw / metrics.metrics.yz;
        width = logoSize.x * logoAtlasScale.x;
        height = logoSize.y * logoAtlasScale.y;
        x = -0.5 * width;
        y = (local.y - 0.5) * height;
    }
    // Core encodes dy as a negative y-up glyph offset. Convert it to the
    // screen-pixel direction before applying the screen-space rotation.
    var localPos = vec2<f32>(
        x + local.x * width + getScaled_dx(i),
        y + getScaled_dy(i)
    );
    let glyphScales = vec4<f32>(sizeScale, sizeRatio, logoSize);
    let glyphOffsets = vec2<f32>(
        alignOffset(u32(getScaled_align(i)), textMetrics.width * sizeRatio),
        baselineOffset(u32(getScaled_baseline(i)), 0.0, params.uCapHeight, params.uDescent) * sizeScale
    );
    if (layer == TEXT_LAYER_FOREGROUND) {
        var bounds = vec4<f32>(1e20, 1e20, -1e20, -1e20);
        for (var gi = textMetrics.glyphStart; gi < textMetrics.glyphEnd; gi++) {
            let g = glyphs[gi];
            let rect = labelGlyphRect(g, glyphMetrics[g.glyphId], glyphScales, glyphOffsets);
            bounds = vec4<f32>(min(bounds.xy, rect.xy), max(bounds.zw, rect.xy + rect.zw));
        }
        localPos = mix(bounds.xy, bounds.zw, local) + vec2<f32>(getScaled_dx(i), getScaled_dy(i));
    }
    let rotated = rot * localPos;
    let localPixel = localAnchor + rotated + effectOffset;
    let pixel = anchor + rotated + effectOffset;

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
    out.glyphOffsets = glyphOffsets;
    out.pickId = 0u;
    out.localPixel = localPixel;
    out.stroke = getScaled_stroke(i);
    out.strokeOpacity = getScaled_strokeOpacity(i);
    out.extent = layerExtent;
    out.devicePixelsPerAtlas = max(
        size * globals.dpr / max(params.uShapePixels, 1.0),
        1.0 / max(params.uSpread, 1.0)
    );
    out.localPosition = localPos - vec2<f32>(getScaled_dx(i), getScaled_dy(i));
    out.glyphScales = glyphScales;
    out.stemDarkening = freeTypeLikeStemDarkening(size * globals.dpr);
    out.layer = vec2<u32>(layer, glyph.stringIndex);
#if defined(uniqueId_DEFINED)
${pickAssignment}
#endif
    return out;
}

fn median(r: f32, g: f32, b: f32) -> f32 {
    return max(min(r, g), min(max(r, g), b));
}

fn sampleTrueDistance(uv: vec2<f32>) -> f32 {
    return textureSampleLevel(fontAtlas, fontSampler, uv, 0.0).a;
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

fn shadowCoverageAt(in: VSOut, uv: vec2<f32>) -> f32 {
    let distance = sampleTrueDistance(uv) * in.devicePixelsPerAtlas +
        in.stemDarkening;
    let maxBlur = max(
        (params.uSpread - 1.0) * in.devicePixelsPerAtlas,
        0.0
    );
    let blur = min(in.extent, maxBlur);
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

fn labelPick(in: VSOut) -> bool {
    let text = stringMetrics[in.layer.y];
    var begin = text.glyphStart;
    var end = text.glyphEnd;
    if (params.uLogoLetters == 0u) {
        let x = (in.localPosition.x - in.glyphOffsets.x) / in.glyphScales.y;
        let bin = i32(floor((x - text.lookupOrigin) / text.lookupWidth));
        if (bin < 0 || u32(bin) >= text.lookupBins) { return false; }
        begin = glyphLookup[text.lookupStart + u32(bin)];
        end = glyphLookup[text.lookupStart + u32(bin) + 1u];
    }
    for (var cursor = begin; cursor < end; cursor++) {
        var gi = cursor;
        if (params.uLogoLetters == 0u) { gi = glyphLookup[cursor]; }
        let g = glyphs[gi];
        let rect = labelGlyphRect(g, glyphMetrics[g.glyphId], in.glyphScales, in.glyphOffsets);
        if (all(in.localPosition >= rect.xy) && all(in.localPosition <= rect.xy + rect.zw)) { return true; }
    }
    return false;
}

fn labelPaint(in: VSOut, dx: vec2<f32>, dy: vec2<f32>) -> vec4<f32> {
    let points = array<vec2<f32>, 4>(
        in.localPosition + dx * 0.25 + dy * 0.25,
        in.localPosition + dx * 0.75 + dy * 0.25,
        in.localPosition + dx * 0.25 + dy * 0.75,
        in.localPosition + dx * 0.75 + dy * 0.75
    );
    let pointMin = min(min(points[0], points[1]), min(points[2], points[3]));
    let pointMax = max(max(points[0], points[1]), max(points[2], points[3]));
    let text = stringMetrics[in.layer.y];
    var first = 0i;
    var last = 0i;
    if (params.uLogoLetters == 0u) {
        let layoutX = (vec2<f32>(pointMin.x, pointMax.x) - in.glyphOffsets.xx)
            / in.glyphScales.yy;
        let bins = vec2<i32>(floor((layoutX - text.lookupOrigin) / text.lookupWidth));
        first = max(0i, bins.x);
        last = min(i32(text.lookupBins) - 1i, bins.y);
    }
    // Query every bin touched by the four samples. Maxima make repeated
    // candidates at bin boundaries idempotent, without a per-fragment set.
    var cf = vec4<f32>(0.0);
    var co = vec4<f32>(0.0);
    var band = vec4<f32>(0.0);
    for (var bin = first; bin <= last; bin++) {
        var begin = text.glyphStart;
        var end = text.glyphEnd;
        if (params.uLogoLetters == 0u) {
            begin = glyphLookup[text.lookupStart + u32(bin)];
            end = glyphLookup[text.lookupStart + u32(bin) + 1u];
        }
        for (var cursor = begin; cursor < end; cursor++) {
            var gi = cursor;
            if (params.uLogoLetters == 0u) { gi = glyphLookup[cursor]; }
            let g = glyphs[gi];
            let m = glyphMetrics[g.glyphId];
            let rect = labelGlyphRect(g, m, in.glyphScales, in.glyphOffsets);
            let atlasToLocal = rect.zw / (m.texRect.zw + vec2<f32>(1.0));
            let inkMin = rect.xy + vec2<f32>(params.uSpread) * atlasToLocal;
            let inkMax = rect.xy + rect.zw - vec2<f32>(params.uSpread) * atlasToLocal;
            let fillReach = vec2<f32>(
                (0.5 + in.stemDarkening) / in.devicePixelsPerAtlas + 1.0
            ) * atlasToLocal;
            let reach = max(fillReach,
                vec2<f32>(in.extent + 1.0) * atlasToLocal / in.devicePixelsPerAtlas);
            if (any(pointMax < inkMin - reach) || any(pointMin > inkMax + reach)) {
                continue;
            }
            var fill = vec4<f32>(0.0);
            var outer = vec4<f32>(0.0);
            for (var j = 0u; j < 4u; j++) {
                let local = (points[j] - rect.xy) / rect.zw;
                if (any(local < vec2<f32>(0.0)) || any(local > vec2<f32>(1.0))) {
                    continue;
                }
                let uv = (m.texRect.xy + local * m.texRect.zw) * params.uAtlasScale;
                let texel = textureSampleLevel(fontAtlas, fontSampler, uv, 0.0);
                let distance = median(texel.r, texel.g, texel.b)
                    * in.devicePixelsPerAtlas + in.stemDarkening;
                // RGB reconstructs sharp fill; A gives round Euclidean offsets.
                let trueDistance = texel.a * in.devicePixelsPerAtlas + in.stemDarkening;
                let guard = (0.5 + in.stemDarkening) / in.devicePixelsPerAtlas + 1.0;
                let localPosition = local * (m.texRect.zw + vec2<f32>(1.0));
                let fillInside = all(localPosition >= vec2<f32>(params.uSpread - guard))
                    && all(localPosition <= m.texRect.zw
                        + vec2<f32>(1.0 - params.uSpread + guard));
                fill[j] = select(0.0, clamp(distance + 0.5, 0.0, 1.0), fillInside);
                let expanded = max(fill[j], clamp(trueDistance + in.extent + 0.5, 0.0, 1.0));
                outer[j] = select(expanded, fill[j], in.extent <= 0.0);
            }
            cf = max(cf, fill);
            co = max(co, outer);
            band = max(band, outer - fill);
        }
    }
    // Retain each original contour's band even inside another glyph's fill.
    // These nested coverages coincide with Ci/Cf/Co for an isolated glyph.
    let gamma = getGammaForColor(in.color.rgb);
    let fillCoverage = pow(dot(cf, vec4<f32>(0.25)), gamma);
    let fill = premultiplyAlpha(in.color);
    let stroke = premultiplyAlpha(vec4<f32>(in.stroke.rgb, in.stroke.a * in.strokeOpacity));
    if (in.extent <= 0.0 || stroke.a <= 0.0) {
        return fill * (fillCoverage * in.opacity);
    }
    let ci = min(cf, max(co - band, vec4<f32>(0.0)));
    let innerCoverage = pow(dot(ci, vec4<f32>(0.25)), gamma);
    let outerCoverage = pow(dot(co, vec4<f32>(0.25)), gamma);
    return (
        innerCoverage * fill
        + (fillCoverage - innerCoverage) * (stroke + (1.0 - stroke.a) * fill)
        + (outerCoverage - fillCoverage) * stroke
    ) * in.opacity;
}

fn shadeBase(in: VSOut, edgeFadeOpacity: f32) -> vec4<f32> {
${foregroundShading}
}

// Picking intentionally ignores edge fading, like the WebGL renderer.
fn shade(in: VSOut) -> vec4<f32> {
    // Like WebGL, pick glyph quads, including counters and transparent paint.
    if (pickingEnabled) {
        if (!labelPick(in)) { discard; }
        return vec4<f32>(1.0);
    }
    return shadeBase(in, 1.0);
}

fn shadeText(in: VSOut) -> vec4<f32> {
    var fade = 1.0;
    if (maxValue(params.uViewportEdgeFadeDistance) > -1e10) {
        let viewportSize = params.uViewport.zw - params.uViewport.xy;
        let localUnit = in.localPixel / viewportSize;
        fade = minValue(
            ((vec4<f32>(1.0, 1.0, 0.0, 0.0) +
                vec4<f32>(-1.0, -1.0, 1.0, 1.0) * localUnit.yxyx) *
                viewportSize.yxyx - params.uViewportEdgeFadeDistance) /
                params.uViewportEdgeFadeWidth
        );
    }
    return shadeBase(in, clamp(fade, 0.0, 1.0));
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
 * @prop {unknown} [font]
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
 * @returns {{ normalized: { channels: Record<string, ChannelConfigInput>, count: number, seriesIndexExpression: string }, textLayout: ReturnType<typeof buildOutlineTextLayout>, shadow: boolean }}
 */
function normalizeTextConfig({
    channels = {},
    count,
    font,
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
    const shadow = hasTextShadow(channels);
    if (!isTrueTypeFont(font)) {
        throw new Error("Text marks require a TrueType outline font.");
    }
    if (shadow) {
        normalizedChannels.shadowColor ??= { value: [0, 0, 0, 1] };
        normalizedChannels.shadowOpacity ??= { value: 0 };
        normalizedChannels.shadowOffsetX ??= { value: 0 };
        normalizedChannels.shadowOffsetY ??= { value: 0 };
        normalizedChannels.shadowBlur ??= { value: 0 };
    }
    const seriesIndexExpression =
        "glyphs[renderItems[i].glyphIndex].stringIndex";
    const strings = resolveTextStrings(textChannel, count);
    const textLayout = buildResolvedTextLayout(strings, font, {
        fontSize,
        lineHeight,
        letterSpacing,
    });
    return {
        normalized: {
            channels: /** @type {Record<string, ChannelConfigInput>} */ (
                normalizedChannels
            ),
            count: strings.length,
            seriesIndexExpression,
        },
        textLayout,
        shadow,
    };
}

/**
 * @param {string[]} strings
 * @param {import("../../fonts/trueTypeFont.js").TrueTypeFont} font
 * @param {TextConfigInput} config
 */
function buildResolvedTextLayout(strings, font, config) {
    return buildOutlineTextLayout(strings, font, {
        fontSize: typeof config.fontSize === "number" ? config.fontSize : 12,
        lineHeight:
            typeof config.lineHeight === "number" ? config.lineHeight : 1,
        letterSpacing:
            typeof config.letterSpacing === "number" ? config.letterSpacing : 0,
    });
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
    get usesPickingEnabledInVertex() {
        return true;
    }

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
                uniform: "uLogoLetters",
                default: false,
                encode: (/** @type {boolean} */ value) => (value ? 1 : 0),
            },
        };
    }

    /** @protected */
    _initializeExtraUniforms() {
        initializePropertySlots(this, this.propertySlotDefinitions);
    }

    /**
     * @param {import("../../renderer.js").Renderer} renderer
     * @param {import("../../index.js").MarkConfig<"text">} config
     * @param {import("../../index.js").MarkProgramCreationContext} [context]
     */
    constructor(renderer, config, context) {
        const { normalized, textLayout, shadow } = normalizeTextConfig(config);
        super(
            renderer,
            {
                ...config,
                ...normalized,
                textLayout,
                shadow,
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
        delete this._markConfig.textLayout;
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
     * @returns {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>}
     */
    get channelSpecs() {
        return TEXT_CHANNEL_SPECS;
    }

    /**
     * @returns {string}
     */
    get shaderBody() {
        return createTextShaderBody(
            /** @type {boolean} */ (this._markConfig.shadow)
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
                visibility: "all",
                wgslName: "glyphs",
                wgslType: "array<GlyphInstance>",
            },
            {
                name: "stringMetrics",
                role: "extraBuffer",
                kind: "buffer",
                bufferType: "read-only-storage",
                visibility: "all",
                wgslName: "stringMetrics",
                wgslType: "array<StringMetrics>",
            },
            {
                name: "glyphMetrics",
                role: "extraBuffer",
                kind: "buffer",
                bufferType: "read-only-storage",
                visibility: "all",
                wgslName: "glyphMetrics",
                wgslType: "array<GlyphMetrics>",
            },
            {
                name: "glyphLookup",
                role: "extraBuffer",
                kind: "buffer",
                bufferType: "read-only-storage",
                visibility: "fragment",
                wgslName: "glyphLookup",
                wgslType: "array<u32>",
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
        resources.push({
            name: "renderItems",
            role: "extraBuffer",
            kind: "buffer",
            bufferType: "read-only-storage",
            visibility: "vertex",
            wgslName: "renderItems",
            wgslType: "array<RenderItem>",
        });
        return resources;
    }

    /** @protected */
    _initializeExtraResources() {
        const layout =
            /** @type {ReturnType<typeof buildOutlineTextLayout>} */ (
                this._markConfig.textLayout
            );
        this._initializeOutlineFontResources(
            /** @type {any} */ (layout),
            /** @type {import("../../fonts/trueTypeFont.js").TrueTypeFont} */ (
                this._markConfig.font
            )
        );
        this._setUniformValue("uLayoutFontSize", layout.fontSize);
        this._updateTextLayoutBuffers(layout);
    }

    /**
     * @param {import("../../index.js").TextLayout & { outlineGlyphs: { glyphId: number, path: string, bounds: import("../../fonts/trueTypeFont.js").TrueTypeBounds, tileWidth: number, tileHeight: number }[] }} layout
     * @param {import("../../fonts/trueTypeFont.js").TrueTypeFont} font
     * @internal Called by initialization hooks during super(), before private branding.
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
        this._setUniformValue("uShapePixels", shapePixels);
        this._setUniformValue("uSpread", OUTLINE_ATLAS_OPTIONS.spread);
        this._extraTextures.set("fontAtlas", outlineAtlasResource(atlas));
        this._borrowedExtraTextures.add("fontAtlas");
        /** @internal Populated by base-constructor hooks. */
        this._outlineAtlas = atlas;
        /** @internal Populated by base-constructor hooks. */
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
     * @param {import("../../index.js").TextLayout & { outlineGlyphs: { glyphId: number, path: string, bounds: import("../../fonts/trueTypeFont.js").TrueTypeBounds, tileWidth: number, tileHeight: number }[] }} layout
     * @param {import("../../fonts/trueTypeFont.js").TrueTypeFont} font
     * @param {import("../../fonts/outlineFontAtlas.js").OutlineFontAtlas} atlas
     * @returns {boolean} Whether the metric buffer identity changed.
     * @internal Called by initialization hooks during super(), before private branding.
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
        return this._writeExtraBuffer("glyphMetrics", glyphMetrics, 32);
    }

    /**
     * @param {ReturnType<typeof buildOutlineTextLayout>} layout
     * @returns {boolean} Whether a bound buffer identity changed.
     * @internal Called by initialization hooks during super(), before private branding.
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
        let changed = this._writeExtraBuffer("glyphs", glyphData, 16);

        const lookup = buildTextGlyphLookup(layout);
        changed =
            this._writeExtraBuffer("stringMetrics", lookup.metrics, 32) ||
            changed;
        changed =
            this._writeExtraBuffer("glyphLookup", lookup.data, 4) || changed;
        const renderItems = buildTextRenderItems(
            layout,
            /** @type {boolean} */ (this._markConfig.shadow)
        );
        changed =
            this._writeExtraBuffer("renderItems", renderItems.data, 8) ||
            changed;
        this._drawOffsets = renderItems.offsets;
        return changed;
    }

    /**
     * @param {string} name
     * @param {ArrayBuffer | ArrayBufferView} data
     * @param {number} minimumSize Byte size of one declared WGSL array element.
     * @returns {boolean} Whether the buffer identity changed.
     * @internal Called by initialization hooks during super(), before private branding.
     */
    _writeExtraBuffer(name, data, minimumSize) {
        const byteLength = data.byteLength;
        // Zero-instance draws still validate the storage element binding size.
        const requiredSize = Math.max(minimumSize, byteLength);
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

        const layout = buildResolvedTextLayout(
            strings,
            /** @type {import("../../fonts/trueTypeFont.js").TrueTypeFont} */ (
                this._markConfig.font
            ),
            this._markConfig
        );
        const resolved = this._resolveSeries(channels);
        const seriesCount = this._seriesBuffers.inferCount(resolved);
        if (seriesCount !== null && seriesCount !== strings.length) {
            throw new Error(
                `Text series data count (${seriesCount}) does not match text count (${strings.length}).`
            );
        }
        let textBuffersChanged = this._updateTextLayoutBuffers(layout);
        textBuffersChanged =
            this._updateOutlineGlyphMetrics(
                /** @type {any} */ (layout),
                /** @type {import("../../fonts/trueTypeFont.js").TrueTypeFont} */ (
                    this._markConfig.font
                ),
                this._outlineAtlas
            ) || textBuffersChanged;
        this.updateSeries(resolved, strings.length, textBuffersChanged);
    }

    destroy() {
        this._outlineAtlasUnsubscribe?.();
        super.destroy();
    }
}
