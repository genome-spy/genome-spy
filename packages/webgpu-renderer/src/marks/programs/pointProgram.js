import BaseProgram from "./internal/baseProgram.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const POINT_CHANNEL_SPECS = {
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { components: 1, scale: "linear", default: 0.5 },
    y: { components: 1, scale: "linear", default: 0.5 },
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
const PI: f32 = 3.141592653589793;
const SQRT3: f32 = 1.7320508075688772;

// Copypaste from fragment shader
const CIRCLE: u32 = 0u;
const SQUARE: u32 = 1u;
const CROSS: u32 = 2u;
const DIAMOND: u32 = 3u;
const TRIANGLE_UP: u32 = 4u;
const TRIANGLE_RIGHT: u32 = 5u;
const TRIANGLE_DOWN: u32 = 6u;
const TRIANGLE_LEFT: u32 = 7u;
const TICK_UP: u32 = 8u;
const TICK_RIGHT: u32 = 9u;
const TICK_DOWN: u32 = 10u;
const TICK_LEFT: u32 = 11u;

fn modf(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn distanceToRatio(d: f32) -> f32 {
    return clamp(d * globals.dpr + 0.5, 0.0, 1.0);
}

fn distanceToColor(d: f32, fill: vec4<f32>, stroke: vec4<f32>, background: vec4<f32>, halfStrokeWidth: f32) -> vec4<f32> {
    if (halfStrokeWidth > 0.0) {
        let sd = abs(d) - halfStrokeWidth;
        return mix(stroke, select(background, fill, d <= 0.0), distanceToRatio(sd));
    }
    return mix(background, fill, distanceToRatio(-d));
}

// The distance functions are inspired by:
// http://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
// These are not true distance functions, because corners need to be sharp.
fn circle(p: vec2<f32>, r: f32) -> f32 {
    return length(p) - r;
}

fn square(p: vec2<f32>, r: f32) -> f32 {
    let q = abs(p);
    return max(q.x, q.y) - r;
}

fn tickUp(p: vec2<f32>, r: f32) -> f32 {
    let halfR = r * 0.5;
    var q = p;
    q.y += halfR;
    q = abs(q);
    return max(q.x - r * 0.15, q.y - halfR);
}

fn equilateralTriangle(p: vec2<f32>, r: f32) -> f32 {
    var q = p;
    q.y = -q.y;
    let k = SQRT3;
    let kr = k * r;
    q.y -= kr / 2.0;
    return max((abs(q.x) * k + q.y) / 2.0, -q.y - kr);
}

fn crossShape(p: vec2<f32>, r: f32) -> f32 {
    let q = abs(p);
    let b = vec2<f32>(0.4, 1.0) * r;
    let v = abs(q) - b.xy;
    let h = abs(q) - b.yx;
    return min(max(v.x, v.y), max(h.x, h.y));
}

fn diamond(p: vec2<f32>, r: f32) -> f32 {
    let q = abs(p);
    return (max(abs(q.x - q.y), abs(q.x + q.y)) - r) / 1.41421356237;
}

struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) size: f32,
    @location(2) radius: f32,
    @location(3) radiusWithPadding: f32,
    @location(4) fill: vec4<f32>,
    @location(5) stroke: vec4<f32>,
    @location(6) fillOpacity: f32,
    @location(7) strokeOpacity: f32,
    @location(8) halfStrokeWidth: f32,
    @location(9) @interpolate(flat) shape: u32,
    @location(10) gradientStrength: f32,
    @location(11) @interpolate(flat) inwardStroke: u32,
    @location(12) rot0: vec2<f32>,
    @location(13) rot1: vec2<f32>,
    @location(14) @interpolate(flat) pickId: u32,
};

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

    let size = getScaled_size(i);
    let diameter = sqrt(size);

    let strokeWidth = getScaled_strokeWidth(i);
    let shapeRaw = getScaled_shape(i);
    var shape = u32(shapeRaw);

    var shapeAngle = 0.0;
    if (shape > TICK_UP && shape <= TICK_LEFT) {
        shapeAngle = f32(shape - TICK_UP) * 90.0;
        shape = TICK_UP;
    } else if (shape > TRIANGLE_UP && shape <= TRIANGLE_LEFT) {
        shapeAngle = f32(shape - TRIANGLE_UP) * 90.0;
        shape = TRIANGLE_UP;
    }

    let angleInDegrees = getScaled_angle(i);
    let angle = -(shapeAngle + angleInDegrees) * PI / 180.0;
    let sinTheta = sin(angle);
    let cosTheta = cos(angle);
    let rot = mat2x2<f32>(cosTheta, sinTheta, -sinTheta, cosTheta);

    let circle = shape == CIRCLE;
    let roomForRotation = select(
        sin(modf(angle, PI / 2.0) + PI / 4.0) / sin(PI / 4.0),
        1.0,
        circle
    );

    let aaPadding = 1.0 / globals.dpr;
    let rotationPadding = (diameter * roomForRotation) - diameter;
    let strokePadding = select(
        strokeWidth * select(SQRT3, 1.0, circle),
        0.0,
        getScaled_inwardStroke(i) > 0u
    );
    let padding = rotationPadding + strokePadding + aaPadding;

    let total = diameter + padding;
    let local = quad[v];
    let px = (getScaled_x(i) + getScaled_dx(i)) + (local.x - 0.5) * total;
    let py = (getScaled_y(i) + getScaled_dy(i)) + (local.y - 0.5) * total;

    let clip = vec2<f32>(
        (px / globals.width) * 2.0 - 1.0,
        1.0 - (py / globals.height) * 2.0
    );

    var out: VSOut;
    out.pos = vec4<f32>(clip, 0.0, 1.0);
    out.local = local;
    out.size = total;
    out.radius = diameter * 0.5;
    out.radiusWithPadding = out.radius + padding * 0.5;
    out.fill = getScaled_fill(i);
    out.stroke = getScaled_stroke(i);
    out.fillOpacity = getScaled_fillOpacity(i);
    out.strokeOpacity = getScaled_strokeOpacity(i);
    out.halfStrokeWidth = strokeWidth * 0.5;
    out.shape = shape;
    out.gradientStrength = getScaled_gradientStrength(i);
    out.inwardStroke = getScaled_inwardStroke(i);
    out.rot0 = rot[0];
    out.rot1 = rot[1];
    out.pickId = 0u;
#if defined(uniqueId_DEFINED)
    out.pickId = getScaled_uniqueId(i) + 1u;
#endif
    return out;
}

fn shade(in: VSOut) -> vec4<f32> {
    let rot = mat2x2<f32>(in.rot0, in.rot1);
    let p = rot * ((in.local * 2.0 - vec2<f32>(1.0)) * in.radiusWithPadding);
    let r = in.radius;
    var d = 0.0;

    if (in.shape == CIRCLE) {
        d = circle(p, r);
    } else if (in.shape == SQUARE) {
        d = square(p, r);
    } else if (in.shape == CROSS) {
        d = crossShape(p, r);
    } else if (in.shape == DIAMOND) {
        d = diamond(p, r);
    } else if (in.shape == TRIANGLE_UP) {
        d = equilateralTriangle(p, r);
    } else if (in.shape == TICK_UP) {
        d = tickUp(p, r);
    } else {
        d = 0.0;
    }

    var fillColor = in.fill;
    var strokeColor = in.stroke;

    fillColor.a = fillColor.a * in.fillOpacity;
    strokeColor.a = strokeColor.a * in.strokeOpacity;

    if (in.gradientStrength > 0.0) {
        fillColor = mix(fillColor, vec4<f32>(1.0), -d * in.gradientStrength / max(r, 0.0001));
    }

    let offset = select(0.0, in.halfStrokeWidth, in.inwardStroke > 0u);
    let color = distanceToColor(
        d + offset,
        fillColor,
        strokeColor,
        vec4<f32>(0.0),
        in.halfStrokeWidth
    );

    if (color.a == 0.0) {
        discard;
    }
    return color;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
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
