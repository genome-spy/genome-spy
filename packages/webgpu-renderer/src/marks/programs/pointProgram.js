import BaseProgram from "./internal/baseProgram.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";
import { linearScale } from "../../scales/linear.js";

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const POINT_CHANNEL_SPECS = {
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

const {
    channels: CHANNELS,
    defaults: DEFAULTS,
    defaultConfigs: DEFAULT_CHANNEL_CONFIGS,
    optionalChannels: OPTIONAL_CHANNELS,
} = buildChannelMaps(POINT_CHANNEL_SPECS);

const POINT_SHADER_BODY = /* wgsl */ `
fn distanceToRatio(d: f32) -> f32 {
    return clamp(d * globals.dpr + 0.5, 0.0, 1.0);
}

fn sourceOver(above: vec4<f32>, below: vec4<f32>) -> vec4<f32> {
    return above + below * (1.0 - above.a);
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

    var quad = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0)
    );

    let size = getScaled_size(i);
    let diameter = sqrt(size);

    var strokeWidth = getScaled_strokeWidth(i);
    let strokeOpacity = getScaled_strokeOpacity(i);

    if (strokeOpacity <= 0.0) {
        strokeWidth = 0.0;
    }

    let aaPadding = 1.0 / globals.dpr;
    let strokePadding = select(
        strokeWidth,
        0.0,
        getScaled_inwardStroke(i) > 0u
    );
    let padding = strokePadding + aaPadding;

    let total = diameter + padding;
    let local = quad[v];
    let centerX = getScaled_x(i) + getScaled_xOffset(i) + getScaled_dx(i);
    let centerY = getScaled_y(i) + getScaled_yOffset(i) + getScaled_dy(i);
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
        applyPlacementClipForPoint(clip, centerClip, i),
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

    var fillColor = in.fill;
    var strokeColor = in.stroke;

    fillColor.a = fillColor.a * in.fillOpacity;
    strokeColor.a = strokeColor.a * in.strokeOpacity;

    if (in.gradientStrength > 0.0) {
        fillColor = mix(fillColor, vec4<f32>(1.0), -d * in.gradientStrength / max(r, 0.0001));
    }

    fillColor = premultiplyAlpha(fillColor);
    strokeColor = premultiplyAlpha(strokeColor);

    let fillCoverage = distanceToRatio(-d);
    var strokeCoverage: f32;
    if (in.inwardStroke > 0u) {
        let innerCoverage = distanceToRatio(-d - 2.0 * in.halfStrokeWidth);
        strokeCoverage = max(fillCoverage - innerCoverage, 0.0);
    } else {
        let outerCoverage = distanceToRatio(in.halfStrokeWidth - d);
        let innerCoverage = distanceToRatio(-in.halfStrokeWidth - d);
        strokeCoverage = max(outerCoverage - innerCoverage, 0.0);
    }
    let fillLayer = fillColor * fillCoverage;
    let strokeLayer = strokeColor * strokeCoverage;
    let color = sourceOver(strokeLayer, fillLayer);

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
     * @returns {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>}
     */
    get channelSpecs() {
        return POINT_CHANNEL_SPECS;
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
