import {
    POSITION_CLAMP_CHANNEL_SPECS,
    POSITION_CLAMP_WGSL,
} from "./positionClamping.js";
import BaseProgram from "./internal/baseProgram.js";
import { linearScale } from "../../scales/linear.js";

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const POINT_CHANNEL_SPECS = {
    ...POSITION_CLAMP_CHANNEL_SPECS,
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { components: 1, scale: linearScale(), default: 0.5 },
    y: { components: 1, scale: linearScale(), default: 0.5 },
    xOffset: { type: "f32", components: 1, default: 0.0 },
    yOffset: { type: "f32", components: 1, default: 0.0 },
    size: { type: "f32", components: 1, default: 100.0 },
    shape: { type: "u32", components: 1, default: 0 },
    strokeWidth: { type: "f32", components: 1, default: 2.0 },
    dx: { type: "f32", components: 1, default: 0.0 },
    dy: { type: "f32", components: 1, default: 0.0 },
    fill: { type: "f32", components: 4, default: [0.3, 0.5, 0.7, 1.0] },
    stroke: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    fillOpacity: { type: "f32", components: 1, default: 1.0 },
    strokeOpacity: { type: "f32", components: 1, default: 1.0 },
    angle: { type: "f32", components: 1, default: 0.0 },
    gradientStrength: { type: "f32", components: 1, default: 0.0 },
    inwardStroke: { type: "u32", components: 1, default: 0 },
    minPickingSize: { type: "f32", components: 1, default: 2.0 },
};

const POINT_SHADER_BODY = /* wgsl */ `
${POSITION_CLAMP_WGSL}

fn distanceToRatio(d: f32) -> f32 {
    return clamp(d * globals.dpr + 0.5, 0.0, 1.0);
}

fn circle(p: vec2<f32>, r: f32) -> f32 {
    return length(p) - r;
}

struct VSOut {
#if defined(PLACEMENT_ENABLED)
    @location(15) @interpolate(flat) placementClip: vec4<f32>,
#endif
    @builtin(position) pos: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) radius: f32,
    @location(2) radiusWithPadding: f32,
    @location(3) fill: vec4<f32>,
    @location(4) stroke: vec4<f32>,
    @location(5) fillOpacity: f32,
    @location(6) strokeOpacity: f32,
    @location(7) halfStrokeWidth: f32,
    @location(8) gradientStrength: f32,
    @location(9) @interpolate(flat) inwardStroke: u32,
    @location(10) @interpolate(flat) pickId: u32,
};

fn culledPoint() -> VSOut {
    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = vec4<f32>(-1e9);
#endif
    out.pos = vec4<f32>(0.0);
    out.local = vec2<f32>(0.0);
    out.radius = 0.0;
    out.radiusWithPadding = 0.0;
    out.fill = vec4<f32>(0.0);
    out.stroke = vec4<f32>(0.0);
    out.fillOpacity = 0.0;
    out.strokeOpacity = 0.0;
    out.halfStrokeWidth = 0.0;
    out.gradientStrength = 0.0;
    out.inwardStroke = 0u;
    out.pickId = 0u;
    return out;
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    if (!isInstanceVisible(i) || !isPlacementVisible(i)) {
        return culledPoint();
    }

    var quad = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0)
    );

    let size = getScaled_size(i);
    var diameter = sqrt(size);

    var strokeWidth = getScaled_strokeWidth(i);
    let strokeOpacity = getScaled_strokeOpacity(i);

    if (strokeOpacity <= 0.0) {
        strokeWidth = 0.0;
    }

    // WebGL clamps subpixel fill geometry before enlarging the picking sprite.
    if (pickingEnabled && (strokeWidth <= 0.0 || getScaled_inwardStroke(i) > 0u)) {
        diameter = max(diameter, 1.0 / globals.dpr);
    }

    let aaPadding = 1.0 / globals.dpr;
    let strokePadding = select(
        strokeWidth,
        0.0,
        getScaled_inwardStroke(i) > 0u
    );
    let padding = strokePadding + aaPadding;

    // Match WebGL's enlarged point sprite without expanding its silhouette
    // into the corners of the bounding quad.
    let total = select(diameter + padding,
        max(diameter + padding, getScaled_minPickingSize(i)), pickingEnabled);
    let local = quad[v];
    let center = projectClampedPosition(
#if defined(xClampRange_DEFINED) || defined(yClampRange_DEFINED)
        vec2<f32>(getScaled_x(i), getScaled_y(i)),
        vec2<f32>(getScaled_xOffset(i) + getScaled_dx(i), getScaled_yOffset(i) + getScaled_dy(i)), i);
#else
        vec2<f32>(getScaled_x(i) + getScaled_dx(i), getScaled_y(i) + getScaled_dy(i)),
        vec2<f32>(getScaled_xOffset(i), getScaled_yOffset(i)), i);
#endif
    let centerX = center.x;
    let centerY = center.y;
    let px = centerX + (local.x - 0.5) * total;
    let py = centerY + (local.y - 0.5) * total;

    if (isOutsideVisibleRange(vec2<f32>(
        centerX,
        centerY
    ))) {
        return culledPoint();
    }

    let clip = vec2<f32>(
        (px / globals.width) * 2.0 - 1.0,
        1.0 - (py / globals.height) * 2.0
    );
    let centerClip = vec2<f32>(
        (centerX / globals.width) * 2.0 - 1.0,
        1.0 - (centerY / globals.height) * 2.0
    );

    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = placementClipBounds(i);
#endif
    out.pos = vec4<f32>(
#if defined(xClampRange_DEFINED) || defined(yClampRange_DEFINED)
        clip,
#else
        applyPlacementClipForPoint(clip, centerClip, i),
#endif
        0.0,
        1.0
    );
    out.local = local;
    out.radius = diameter * 0.5;
    out.radiusWithPadding = out.radius + padding * 0.5;
    out.fill = getScaled_fill(i);
    out.stroke = getScaled_stroke(i);
    out.fillOpacity = getScaled_fillOpacity(i);
    out.strokeOpacity = strokeOpacity;
    out.halfStrokeWidth = strokeWidth * 0.5;
    out.gradientStrength = getScaled_gradientStrength(i);
    out.inwardStroke = getScaled_inwardStroke(i);
    out.pickId = 0u;
#if defined(uniqueId_DEFINED)
    out.pickId = getScaled_uniqueId(i) + 1u;
#endif
    return out;
}

fn shade(in: VSOut) -> vec4<f32> {
    let p = (in.local * 2.0 - vec2<f32>(1.0)) * in.radiusWithPadding;
    let r = in.radius;
    let d = circle(p, r);

    if (pickingEnabled) {
        if (d > in.halfStrokeWidth) { discard; }
        return vec4<f32>(1.0);
    }

    var fillColor = in.fill;
    var strokeColor = in.stroke;

    fillColor.a = fillColor.a * in.fillOpacity;
    strokeColor.a = strokeColor.a * in.strokeOpacity;

    if (in.gradientStrength > 0.0) {
        fillColor = mix(fillColor, vec4<f32>(vec3<f32>(1.0), fillColor.a), -d * in.gradientStrength / max(r, 0.0001));
    }

    fillColor = premultiplyAlpha(fillColor);
    strokeColor = premultiplyAlpha(strokeColor);

    let fillCoverage = distanceToRatio(-d);
    var color = fillColor * fillCoverage;
    if (in.halfStrokeWidth > 0.0) {
        let inward = in.inwardStroke > 0u;
        let innerCoverage = distanceToRatio(
            -d - select(in.halfStrokeWidth, 2.0 * in.halfStrokeWidth, inward)
        );
        let outerCoverage = select(distanceToRatio(in.halfStrokeWidth - d), fillCoverage, inward);
        color = innerCoverage * fillColor
            + (fillCoverage - innerCoverage) * (strokeColor + (1.0 - strokeColor.a) * fillColor)
            + (outerCoverage - fillCoverage) * strokeColor;
    }

    if (color.a == 0.0) {
        discard;
    }
    return color;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
#if defined(PLACEMENT_ENABLED)
    if (!isInsidePlacementClip(in.pos, in.placementClip)) { discard; }
#endif
    return shade(in);
}
`;

export default class PointProgram extends BaseProgram {
    get usesPickingEnabledInVertex() {
        return true;
    }

    /** @returns {GPUPrimitiveTopology} */
    get primitiveTopology() {
        return "triangle-strip";
    }

    /** @returns {number} */
    get verticesPerInstance() {
        return 4;
    }

    /**
     * @returns {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>}
     */
    get channelSpecs() {
        return POINT_CHANNEL_SPECS;
    }

    /**
     * @returns {string}
     */
    get shaderBody() {
        return POINT_SHADER_BODY;
    }

    /**
     * @param {string} name
     * @returns {[number, number] | undefined}
     */
    getDefaultScaleRange(name) {
        if (!this.renderer?._globals) {
            return undefined;
        }
        if (name === "x") {
            return [0, this.renderer._globals.width];
        }
        if (name === "y") {
            return [0, this.renderer._globals.height];
        }
        return undefined;
    }
}
