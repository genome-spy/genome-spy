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
    @location(4) along: f32,
    @location(11) @interpolate(flat) span: f32,
    @location(5) @interpolate(flat) strokeCap: u32,
    @location(6) @interpolate(flat) dashIndex: u32,
    @location(7) @interpolate(flat) dashOffset: f32,
    @location(8) @interpolate(flat) pickId: u32,
    @location(9) @interpolate(flat) stroke: vec4<f32>,
    @location(10) @interpolate(flat) outset: f32,
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
    out.along = 0.0;
    out.span = 0.0;
    out.strokeCap = 0u;
    out.dashIndex = 0u;
    out.dashOffset = 0.0;
    out.stroke = vec4<f32>(0.0);
    out.outset = 0.0;
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

    let local = quad[v];

    let pixelSize = 1.0 / globals.dpr;

    // Stroke width in pixels.
    var width = getScaled_size(i);
    if (width <= 0.0) { return culledRule(); }
    let borderWidth = max(getScaled_strokeWidth(i), 0.0);
    // Numeric alignment: inside=0, center=1, outside=2.
    let expansion = borderWidth * f32(getScaled_strokeAlign(i)) * 0.5;
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
    let span = max(len, getScaled_minLength(i));
    let halfWidth = 0.5 * width;
    let end = select(0.0, halfWidth, strokeCap != BUTT);
    let padding = expansion + 0.5 * pixelSize;
    let along = mix(-end - padding, span + end + padding, local.x);
    let across = (local.y - 0.5) * (width + 2.0 * padding);
    let position = (a + b) * 0.5 + tangent / len * (along - span * 0.5) + normal * across;
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
    out.normalDistance = across;
    out.halfWidth = halfWidth;
    out.opacity = opacity;
    out.along = along;
    out.span = span;
    out.strokeCap = strokeCap;
    out.dashIndex = u32(getScaled_strokeDash(i));
    out.dashOffset = f32(getScaled_strokeDashOffset(i));
    out.pickId = 0u;
#if defined(uniqueId_DEFINED)
    out.pickId = getScaled_uniqueId(i) + 1u;
#endif
    return out;
}

// Signed distance to a finite rectangle or a capsule clipped by a dash interval.
// The closest point uses the actual clipped contour, including acute cap cuts.
fn intervalCoverage(in: VSOut, interval: vec2<f32>) -> vec3<f32> {
    if (interval.x >= interval.y) { return vec3<f32>(0.0); }
    let p = vec2<f32>(in.along, in.normalDistance);
    let radius = in.halfWidth;
    let span = in.span;
    var nearest = vec2<f32>(clamp(p.x, interval.x, interval.y), clamp(p.y, -radius, radius));
    var interior = min(radius - abs(p.y), min(p.x - interval.x, interval.y - p.x));
    if (in.strokeCap == ROUND) {
        let center = vec2<f32>(clamp(p.x, 0.0, span), 0.0);
        let v = p - center;
        let distance = length(v);
        nearest = p;
        if (distance > radius) { nearest = center + v * (radius / distance); }
        nearest.x = clamp(nearest.x, interval.x, interval.y);
        let capX = max(-nearest.x, max(nearest.x - span, 0.0));
        let height = sqrt(max(0.0, radius * radius - capX * capX));
        nearest.y = clamp(p.y, -height, height);
        interior = min(radius - distance, min(p.x - interval.x, interval.y - p.x));
    }
    let distance = select(length(p - nearest), -interior, interior >= 0.0);
    let cf = clamp(0.5 - distance * globals.dpr, 0.0, 1.0);
    if (in.inset == 0.0 && in.outset == 0.0) { return vec3<f32>(cf); }
    var maxInset = min(radius, (interval.y - interval.x) * 0.5);
    if (in.strokeCap == ROUND) {
        maxInset = min(maxInset, min(interval.y + radius, span + radius - interval.x) * 0.5);
    }
    let co = clamp(0.5 - (distance - in.outset) * globals.dpr, 0.0, 1.0);
    let ci = select(clamp(0.5 - (distance + in.inset) * globals.dpr, 0.0, 1.0),
        0.0, in.inset > 0.0 && in.inset >= maxInset);
    return vec3<f32>(ci, cf, co);
}

fn ruleCoverage(in: VSOut) -> vec3<f32> {
    let span = in.span;
    let end = select(0.0, in.halfWidth, in.strokeCap != BUTT);
    let bounds = vec2<f32>(-end, span + end);
    if (params.uDashPatternCount == 0u || in.dashIndex >= params.uDashPatternCount) {
        return intervalCoverage(in, bounds);
    }
    let info = textureLoad(dashAtlas, vec2<i32>(0, i32(in.dashIndex)), 0);
    if (info.z == 1u) { return intervalCoverage(in, bounds); }
    if (info.z == 2u) { return vec3<f32>(0.0); }
    let p = vec2<f32>(in.along, in.normalDistance);
    var query = clamp(p.x, bounds.x, bounds.y);
    if (in.strokeCap == ROUND) {
        let center = vec2<f32>(clamp(p.x, 0.0, span), 0.0);
        let v = p - center;
        if (length(v) > in.halfWidth) { query = (center + normalize(v) * in.halfWidth).x; }
    }
    let period = f32(info.x + 256u * info.y);
    let phase = fract((query + in.dashOffset) / period) * period;
    // A tiny negative phase can round fract() to one; wrap the lookup as well.
    let local = select(phase, 0.0, phase == period);
    var coverage = vec3<f32>(0.0);
    for (var side = 0u; side < 2u; side++) {
        let packed = textureLoad(dashAtlas,
            vec2<i32>(1 + i32(floor(local)) * 2 + i32(side), i32(in.dashIndex)), 0);
        let interval = decodeDashInterval(packed) + query - fract(local);
        coverage = max(coverage, intervalCoverage(in,
            vec2<f32>(max(bounds.x, interval.x), min(bounds.y, interval.y))));
    }
    return coverage;
}

fn shade(in: VSOut) -> vec4<f32> {
    let coverage = ruleCoverage(in);
    let ci = coverage.x;
    let cf = coverage.y;
    let co = coverage.z;
    let fill = premultiplyAlpha(in.fill);
    if (in.outset == 0.0 && in.inset == 0.0) { return cf * fill * in.opacity; }
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
    get channelSpecs() {
        return RULE_CHANNEL_SPECS;
    }

    get shaderBody() {
        return RULE_SHADER_BODY;
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
                format: "rgba8uint",
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
            format: "rgba8uint",
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
