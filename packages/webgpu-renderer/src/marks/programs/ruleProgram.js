import { POSITION_CLAMP_CHANNEL_SPECS } from "./positionClamping.js";
import BaseProgram from "./internal/baseProgram.js";
import DASH_WGSL from "../../wgsl/dash.wgsl.js";
import { buildDashAtlas } from "../../utils/dashAtlas.js";
import { createTextureFromData } from "../../utils/webgpuTextureUtils.js";
import { gpuLabel } from "../../utils/gpuLabel.js";

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const RULE_CHANNEL_SPECS = {
    ...POSITION_CLAMP_CHANNEL_SPECS,
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { type: "f32", components: 1 },
    x2: { type: "f32", components: 1 },
    y: { type: "f32", components: 1 },
    y2: { type: "f32", components: 1 },
    xOffset: { type: "f32", components: 1, default: 0 },
    x2Offset: { type: "f32", components: 1, default: 0 },
    yOffset: { type: "f32", components: 1, default: 0 },
    y2Offset: { type: "f32", components: 1, default: 0 },
    size: { type: "f32", components: 1, default: 1.0 },
    fill: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    opacity: { type: "f32", components: 1, default: 1.0 },
    stroke: { type: "f32", components: 4, default: [0, 0, 0, 1] },
    fillOpacity: { type: "f32", components: 1, default: 1 },
    strokeOpacity: { type: "f32", components: 1, default: 1 },
    strokeAlign: { type: "u32", components: 1, default: 2 },
    strokeWidth: { type: "f32", components: 1, default: 0 },
    minLength: { type: "f32", components: 1, default: 0.0 },
    strokeCap: { type: "u32", components: 1, default: 0 },
    strokeDash: { type: "u32", components: 1, default: 0 },
    strokeDashOffset: { components: 1, default: 0.0 },
};

const RULE_SHADER_BODY = /* wgsl */ `
${DASH_WGSL}

// Line caps and dashes are supported.
// Keep rule math in pixel coordinates to avoid unit-range indirection.

// Line caps
const BUTT: u32 = 0u;
const SQUARE: u32 = 1u;
const ROUND: u32 = 2u;

struct VSOut {
#if defined(PLACEMENT_ENABLED)
    @location(15) @interpolate(flat) placementClip: vec4<f32>,
#endif
    @builtin(position) pos: vec4<f32>,
    @location(0) fill: vec4<f32>,
    @location(1) normalDistance: f32,
    @location(2) halfWidth: f32,
    @location(3) opacity: f32,
    @location(4) posInPixels: vec2<f32>,
    @location(5) @interpolate(flat) strokeCap: u32,
    @location(6) @interpolate(flat) dashIndex: u32,
    @location(7) @interpolate(flat) dashOffset: f32,
    @location(8) @interpolate(flat) pickId: u32,
    @location(9) @interpolate(flat) stroke: vec4<f32>,
    @location(10) @interpolate(flat) outset: f32,
    @location(11) @interpolate(flat) body: u32,
    @location(12) @interpolate(flat) inset: f32,
};

fn culledRule() -> VSOut {
    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = vec4<f32>(-1e9);
#endif
    out.pos = vec4<f32>(0.0);
    out.fill = vec4<f32>(0.0);
    out.normalDistance = 0.0;
    out.halfWidth = 0.0;
    out.opacity = 0.0;
    out.posInPixels = vec2<f32>(0.0);
    out.strokeCap = 0u;
    out.dashIndex = 0u;
    out.dashOffset = 0.0;
    out.stroke = vec4<f32>(0.0);
    out.outset = 0.0;
    out.body = 0u;
    out.inset = 0.0;
    out.pickId = 0u;
    return out;
}

// Preserve the line direction and interpolate around its center to avoid
// cancellation between large offscreen positions during close zooms.
fn clipRuleAxis(a: ptr<function, vec2<f32>>, b: ptr<function, vec2<f32>>,
    axis: u32, bounds: vec2<f32>) -> bool {
    let delta = (*b)[axis] - (*a)[axis];
    if (delta == 0.0) {
        return (*a)[axis] >= bounds.x && (*a)[axis] <= bounds.y;
    }
    if (max((*a)[axis], (*b)[axis]) < bounds.x ||
        min((*a)[axis], (*b)[axis]) > bounds.y) {
        return false;
    }
    let center = (*a + *b) * 0.5;
    let direction = (*b - *a) / delta;
    if ((*a)[axis] < bounds.x || (*a)[axis] > bounds.y) {
        let edge = clamp((*a)[axis], bounds.x, bounds.y);
        *a = center + direction * (edge - center[axis]);
        (*a)[axis] = edge;
    }
    if ((*b)[axis] < bounds.x || (*b)[axis] > bounds.y) {
        let edge = clamp((*b)[axis], bounds.x, bounds.y);
        *b = center + direction * (edge - center[axis]);
        (*b)[axis] = edge;
    }
    return true;
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    if (!isInstanceVisible(i) || !isPlacementVisible(i)) {
        return culledRule();
    }

    var quad = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0)
    );

    // Preserve the original body triangles and their hardware-owned butt boundaries.
    // Eight perimeter cells extend coverage without reconstructing those boundaries.
    let cell = select(4u, v / 6u, BORDER_GEOMETRY);
    let corner = quad[v % 6u];
    let grid = vec2<u32>(cell % 3u, cell / 3u) + vec2<u32>(corner);
    let local = vec2<f32>(select(0.0, 1.0, grid.x >= 2u),
                          select(0.0, 1.0, grid.y >= 2u));

    let pixelSize = 1.0 / globals.dpr;

    // Stroke width in pixels.
    var width = getScaled_size(i);
    if (width <= 0.0) { return culledRule(); }
    let borderWidth = max(getScaled_strokeWidth(i), 0.0);
    // Numeric alignment: inside=0, center=1, outside=2.
    let expansion = borderWidth * f32(getScaled_strokeAlign(i)) * 0.5;
    let extra = select(0.0, expansion + 0.5 * pixelSize, expansion > 0.0);
    var opacity = getScaled_opacity(i);

    // Avoid artifacts in very thin lines by clamping the size and adjusting opacity respectively.
    if (width < pixelSize) {
        opacity *= width / pixelSize;
        width = pixelSize;
    }

    // Place the endpoints before extruding the stroke so that occurrence
    // scaling does not also scale pixel-sized widths, offsets, or line caps.
    var a = applyPlacementPixel(
        vec2<f32>(getScaled_x(i), getScaled_y(i)),
        i
    ) + vec2<f32>(getScaled_xOffset(i), getScaled_yOffset(i));
    var b = applyPlacementPixel(
        vec2<f32>(getScaled_x2(i), getScaled_y2(i)),
        i
    ) + vec2<f32>(getScaled_x2Offset(i), getScaled_y2Offset(i));

    let upper = vec2<f32>(globals.width, globals.height);
    // The overscan keeps artificial caps and thick strokes outside the image.
    let margin = max(upper, vec2<f32>(width + expansion + getScaled_minLength(i) + pixelSize));
    var xBounds = vec2<f32>(-margin.x, upper.x + margin.x);
    var yBounds = vec2<f32>(-margin.y, upper.y + margin.y);
#if defined(xClampRange_DEFINED)
    let xRange = getScaled_xClampRange(i);
    xBounds = vec2<f32>(applyPlacementPixel(vec2<f32>(xRange.x, 0.0), i).x,
        applyPlacementPixel(vec2<f32>(xRange.y, 0.0), i).x);
#endif
#if defined(yClampRange_DEFINED)
    let yRange = getScaled_yClampRange(i);
    yBounds = vec2<f32>(applyPlacementPixel(vec2<f32>(0.0, yRange.x), i).y,
        applyPlacementPixel(vec2<f32>(0.0, yRange.y), i).y);
#endif
    if (!clipRuleAxis(&a, &b, 0u, xBounds) ||
        !clipRuleAxis(&a, &b, 1u, yBounds) || all(a == b)) { return culledRule(); }

    let tangent = b - a;
    let len = length(tangent);
    let normal = normalize(vec2<f32>(-tangent.y, tangent.x));

    let strokeCap = u32(getScaled_strokeCap(i));
    let minLength = getScaled_minLength(i);
    var offset = 0.0;
    var relativeDiff = 0.0;
    if (minLength > 0.0 || strokeCap != BUTT) {
        var diff = max(0.0, minLength - len);
        // Add line caps
        if (strokeCap != BUTT) {
            diff = diff + width;
        }
        relativeDiff = diff / len;
        offset = relativeDiff * (local.x - 0.5);
    }

    // Add an extra pixel to stroke width to accommodate edge antialiasing.
    let aaPadding = pixelSize;
    let paddedWidth = width + aaPadding;
    let tx = select(select(0.0, extra, grid.x == 3u), -extra, grid.x == 0u);
    let ny = select(select(0.0, expansion, grid.y == 3u), -expansion, grid.y == 0u);
    let halfWidth = 0.5 * width;
    let side = local.y - 0.5;

    // Apply caps and minimum length by spreading the vertices along the tangent.
    var position = a + tangent * (local.x + offset);

    // Extrude the quad along the normal direction.
    position = position + normal * side * paddedWidth;
    position = position + normalize(tangent) * tx + normal * ny;
    let clip = vec2<f32>(
        (position.x / globals.width) * 2.0 - 1.0,
        1.0 - (position.y / globals.height) * 2.0
    );

    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = placementClipBounds(i);
#endif
    out.pos = vec4<f32>(applyPlacementClipForRule(clip, i), 0.0, 1.0);
    out.fill = getScaled_fill(i);
    out.fill.a *= getScaled_fillOpacity(i);
    out.stroke = getScaled_stroke(i);
    out.stroke.a *= getScaled_strokeOpacity(i);
    out.outset = expansion;
    out.inset = borderWidth - expansion;
    out.body = select(0u, 1u, cell == 4u);
    out.normalDistance = side * paddedWidth + ny;
    out.halfWidth = halfWidth;
    out.opacity = opacity;
    // Distances from the line endings (pixels). Used for round caps.
    out.posInPixels = vec2<f32>(local.x, 1.0 - local.x) * (1.0 + relativeDiff) * len + vec2<f32>(tx, -tx) -
        vec2<f32>(select(0.0, width * 0.5, strokeCap != BUTT));
    out.strokeCap = strokeCap;
    out.dashIndex = u32(getScaled_strokeDash(i));
    out.dashOffset = f32(getScaled_strokeDashOffset(i));
    out.pickId = 0u;
#if defined(uniqueId_DEFINED)
    out.pickId = getScaled_uniqueId(i) + 1u;
#endif
    return out;
}

fn shade(in: VSOut) -> vec4<f32> {
    let distanceFromEnd = -min(in.posInPixels.x, in.posInPixels.y);
    var distance: f32;
    if (distanceFromEnd > 0.0 && in.strokeCap == ROUND) {
        // Round caps
        distance = length(vec2<f32>(distanceFromEnd, in.normalDistance));
    } else {
        distance = abs(in.normalDistance);
    }
    let dash = dashMask(
        dashAtlas,
        in.dashIndex,
        in.posInPixels.x,
        in.dashOffset
    );
    // Freeze the legacy nominal body independently of the expanded quad.
    let bodyEnd = select(0.0, in.halfWidth, in.strokeCap != BUTT);
    let coverage = clamp(((in.halfWidth - distance) * globals.dpr) + 0.5, 0.0, 1.0) * dash;
    if (!BORDER_GEOMETRY || (in.outset == 0.0 && in.inset == 0.0)) {
        let fill = vec4<f32>(in.fill.rgb, in.fill.a * in.opacity);
        return premultiplyAlpha(fill) * coverage;
    }
    let cf = select(0.0, coverage, in.body != 0u);
    var outside = min(in.halfWidth + in.outset - abs(in.normalDistance),
        bodyEnd + in.outset - distanceFromEnd);
    if (in.strokeCap == ROUND) {
        outside = in.halfWidth + in.outset -
            length(vec2<f32>(max(distanceFromEnd, 0.0), in.normalDistance));
    }
    let co = select(cf, max(cf, clamp(outside * globals.dpr + 0.5, 0.0, 1.0)), in.outset > 0.0);
    var inner = min(in.halfWidth - in.inset - abs(in.normalDistance),
        bodyEnd - in.inset - distanceFromEnd);
    if (in.strokeCap == ROUND) {
        inner = in.halfWidth - in.inset -
            length(vec2<f32>(max(distanceFromEnd, 0.0), in.normalDistance));
    }
    let empty = in.halfWidth <= in.inset ||
        (in.strokeCap != ROUND && in.posInPixels.x + in.posInPixels.y + 2.0 * bodyEnd <= 2.0 * in.inset);
    let ci = select(select(min(cf, clamp(inner * globals.dpr + 0.5, 0.0, 1.0)), 0.0, empty), cf, in.inset == 0.0);
    let fill = premultiplyAlpha(in.fill);
    let stroke = premultiplyAlpha(in.stroke);
    return (ci * fill + (cf - ci) * (stroke + (1.0 - stroke.a) * fill) +
        (co - cf) * stroke) * in.opacity;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
#if defined(PLACEMENT_ENABLED)
    if (!isInsidePlacementClip(in.pos, in.placementClip)) { discard; }
#endif
    return shade(in);
}
`;

export default class RuleProgram extends BaseProgram {
    get verticesPerInstance() {
        return this._markConfig.channels?.strokeWidth ? 54 : 6;
    }

    get channelSpecs() {
        return RULE_CHANNEL_SPECS;
    }

    get shaderBody() {
        return (
            `const BORDER_GEOMETRY: bool = ${!!this._markConfig.channels?.strokeWidth};\n` +
            RULE_SHADER_BODY
        );
    }

    getExtraUniformLayout() {
        /** @type {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4 }[]} */
        const layout = [
            { name: "uDashPatternCount", type: "u32", components: 1 },
        ];
        return layout;
    }

    getExtraResourceDefs() {
        /** @type {import("../shaders/markShaderBuilder.js").ExtraResourceDef[]} */
        const defs = [
            {
                name: "dashAtlas",
                role: "extraTexture",
                kind: "texture",
                sampleType: "uint",
                dimension: "2d",
                visibility: "fragment",
                wgslName: "dashAtlas",
            },
        ];
        return defs;
    }

    /** @protected */
    _initializeExtraResources() {
        const patterns = /** @type {number[][] | null | undefined} */ (
            this._markConfig?.dashPatterns ?? null
        );
        const atlas = buildDashAtlas(patterns);
        /** @type {number} * @internal Populated by base-constructor hooks.
         */
        this._dashPatternCount = atlas.patternCount;

        const texture = createTextureFromData(
            this.device,
            {
                format: "r8uint",
                width: atlas.width,
                height: atlas.height,
                data: atlas.data,
            },
            undefined,
            gpuLabel(this.label, "dash atlas")
        );
        this._extraTextures.set("dashAtlas", {
            texture,
            width: atlas.width,
            height: atlas.height,
            format: "r8uint",
        });

        const dashChannel = this._channels.strokeDash;
        if (
            atlas.patternCount > 0 &&
            dashChannel &&
            dashChannel.value !== undefined
        ) {
            const value = Array.isArray(dashChannel.value)
                ? dashChannel.value[0]
                : dashChannel.value;
            if (typeof value === "number" && value >= atlas.patternCount) {
                console.warn(
                    `[webgpu-renderer] strokeDash value ${value} exceeds pattern count ${atlas.patternCount}.`
                );
            }
        }
    }

    /** @protected */
    _initializeExtraUniforms() {
        this._setUniformValue("uDashPatternCount", this._dashPatternCount ?? 0);
    }
}
