import BaseProgram from "./internal/baseProgram.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const RECT_CHANNEL_SPECS = {
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { type: "f32", components: 1, scale: "linear", default: 0 },
    x2: { type: "f32", components: 1, scale: "linear", default: 10 },
    y: { type: "f32", components: 1, scale: "linear", default: 0 },
    y2: { type: "f32", components: 1, scale: "linear", default: 10 },
    fill: { type: "f32", components: 4, default: [0.27, 0.49, 0.8, 1.0] },
    stroke: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    fillOpacity: { type: "f32", components: 1, default: 1.0 },
    strokeOpacity: { type: "f32", components: 1, default: 1.0 },
    strokeWidth: { type: "f32", components: 1, default: 1.0 },
    cornerRadius: { type: "f32", components: 1, default: 0.0 },
    minWidth: { type: "f32", components: 1, default: 0.0 },
    minHeight: { type: "f32", components: 1, default: 0.0 },
    minOpacity: { type: "f32", components: 1, default: 0.0 },
    shadowOffsetX: { type: "f32", components: 1, default: 0.0 },
    shadowOffsetY: { type: "f32", components: 1, default: 0.0 },
    shadowBlur: { type: "f32", components: 1, default: 0.0 },
    shadowOpacity: { type: "f32", components: 1, default: 0.0 },
    shadowColor: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    hatchPattern: { type: "u32", components: 1, default: 0 },
};

const {
    channels: CHANNELS,
    defaults: DEFAULTS,
    defaultConfigs: DEFAULT_CHANNEL_CONFIGS,
    optionalChannels: OPTIONAL_CHANNELS,
} = buildChannelMaps(RECT_CHANNEL_SPECS);

const RECT_SHADER_BODY = /* wgsl */ `
fn clampMinSize(pos: ptr<function, f32>, frac: f32, size: f32, minSize: f32) -> f32 {
    if (minSize > 0.0 && size < minSize) {
        (*pos) = (*pos) + (frac - 0.5) * (minSize - size);
        return size / minSize;
    }
    return 1.0;
}

fn sort(a: ptr<function, f32>, b: ptr<function, f32>) {
    if (*a > *b) {
        let tmp = *b;
        *b = *a;
        *a = tmp;
    }
}

fn sdRoundedBox(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - r;
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

fn shadowAlpha(d: f32, blur: f32) -> f32 {
    // TODO: Port the full Gaussian shadow from GLSL. This is a simple fallback.
    if (blur <= 0.0) {
        return select(0.0, 1.0, d <= 0.0);
    }
    return clamp(1.0 - smoothstep(0.0, blur, d), 0.0, 1.0);
}

fn modf(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn diagonalPattern(uv: vec2<f32>, spacing: f32, halfStrokeWidth: f32) -> f32 {
    // Using 1.5 to approximate sqrt(2.0) to reduce aliasing artifacts.
    let divisor = spacing * halfStrokeWidth * 2.0 * 1.5;
    return abs(modf(uv.x - uv.y, divisor) - 0.5 * divisor) / 1.5;
}

fn verticalPattern(x: f32, spacing: f32, halfStrokeWidth: f32) -> f32 {
    let divisor = spacing * halfStrokeWidth * 2.0;
    return abs(modf(x, divisor)) / 2.0;
}

fn circle(p: vec2<f32>, r: f32) -> f32 {
    return length(p) - r;
}

fn masonryCirclePattern(uv: vec2<f32>, spacing: f32, radius: f32) -> f32 {
    let halfSpacing = 0.5 * spacing;
    let row = floor(uv.y / spacing);
    let shift = (row % 2.0) * halfSpacing;

    let shifted = vec2<f32>(uv.x + shift, uv.y + halfSpacing);
    let cell = vec2<f32>(
        modf(shifted.x + 0.5 * spacing, spacing),
        modf(shifted.y + 0.5 * spacing, spacing)
    ) - halfSpacing;

    return abs(circle(cell, radius));
}

fn hatchPattern(uv: vec2<f32>, halfStrokeWidth: f32, patternType: i32) -> f32 {
    let spacing = 4.0;

    if (patternType == 1) {
        return diagonalPattern(vec2<f32>(uv.x, -uv.y), spacing, halfStrokeWidth);
    }
    if (patternType == 2) {
        return diagonalPattern(uv, spacing, halfStrokeWidth);
    }
    if (patternType == 3) {
        return min(
            diagonalPattern(uv, spacing, halfStrokeWidth),
            diagonalPattern(vec2<f32>(uv.x, -uv.y), spacing, halfStrokeWidth)
        );
    }
    if (patternType == 4) {
        return verticalPattern(uv.x, spacing, halfStrokeWidth);
    }
    if (patternType == 5) {
        return verticalPattern(uv.y, spacing, halfStrokeWidth);
    }
    if (patternType == 6) {
        return min(
            verticalPattern(uv.x, spacing, halfStrokeWidth),
            verticalPattern(uv.y, spacing, halfStrokeWidth)
        );
    }
    if (patternType == 7 || patternType == 8 || patternType == 9) {
        let spacing = halfStrokeWidth * 14.0;
        let radius = spacing * select(0.07, select(0.2, 0.35, patternType == 9), patternType == 8);
        return masonryCirclePattern(uv, spacing, radius);
    }

    return 1.0e20;
}

struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) size: vec2<f32>,
    @location(2) fill: vec4<f32>,
    @location(3) stroke: vec4<f32>,
    @location(4) fillOpacity: f32,
    @location(5) strokeOpacity: f32,
    @location(6) strokeWidth: f32,
    @location(7) cornerRadius: f32,
    @location(8) shadowOffset: vec2<f32>,
    @location(9) shadowBlur: f32,
    @location(10) shadowOpacity: f32,
    @location(11) shadowColor: vec4<f32>,
    @location(12) @interpolate(flat) hatchPattern: u32,
    @location(13) @interpolate(flat) pickId: u32,
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

    var x = getScaled_x(i);
    var x2 = getScaled_x2(i);
    var y = getScaled_y(i);
    var y2 = getScaled_y2(i);
    sort(&x, &x2);
    sort(&y, &y2);
    let w = x2 - x;
    let h = y2 - y;

    let local = quad[v];
    var px = x + local.x * w;
    var py = y + local.y * h;

    let minW = getScaled_minWidth(i);
    let minH = getScaled_minHeight(i);
    let minOpacity = getScaled_minOpacity(i);
    var opaFactor = max(minOpacity, min(
        clampMinSize(&px, local.x, w, minW),
        clampMinSize(&py, local.y, h, minH)
    ));

    let clip = vec2<f32>(
        (px / globals.width) * 2.0 - 1.0,
        1.0 - (py / globals.height) * 2.0
    );

    var out: VSOut;
    out.pos = vec4<f32>(clip, 0.0, 1.0);
    out.local = local;
    out.size = vec2<f32>(w, h);
    out.fill = getScaled_fill(i);
    out.stroke = getScaled_stroke(i);
    out.fillOpacity = getScaled_fillOpacity(i) * opaFactor;
    out.strokeOpacity = getScaled_strokeOpacity(i) * opaFactor;
    out.strokeWidth = getScaled_strokeWidth(i);
    out.cornerRadius = getScaled_cornerRadius(i);
    out.shadowOffset = vec2<f32>(getScaled_shadowOffsetX(i), getScaled_shadowOffsetY(i));
    out.shadowBlur = getScaled_shadowBlur(i);
    out.shadowOpacity = getScaled_shadowOpacity(i);
    out.shadowColor = getScaled_shadowColor(i);
    out.hatchPattern = getScaled_hatchPattern(i);
    out.pickId = 0u;
#if defined(uniqueId_DEFINED)
    out.pickId = getScaled_uniqueId(i) + 1u;
#endif
    return out;
}

fn shade(in: VSOut) -> vec4<f32> {
    let halfSize = in.size * 0.5;
    let centered = (in.local - vec2<f32>(0.5)) * in.size;

    var d = sdRoundedBox(centered, halfSize, in.cornerRadius);

    var fillColor = in.fill;
    fillColor.a = fillColor.a * in.fillOpacity;

    var strokeColor = in.stroke;
    strokeColor.a = strokeColor.a * in.strokeOpacity;

    var background = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (in.shadowOpacity > 0.0) {
        let sd = sdRoundedBox(centered - in.shadowOffset, halfSize, in.cornerRadius);
        let alpha = shadowAlpha(sd, in.shadowBlur) * in.shadowOpacity;
        background = vec4<f32>(in.shadowColor.rgb, alpha);
    }

    let halfStrokeWidth = in.strokeWidth * 0.5;
    let patternType = i32(in.hatchPattern);
    if (halfStrokeWidth > 0.0 && patternType > 0) {
        d = max(d, -hatchPattern(centered, halfStrokeWidth, patternType));
    }

    return distanceToColor(d, fillColor, strokeColor, background, halfStrokeWidth);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return shade(in);
}
`;

export default class RectProgram extends BaseProgram {
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
        return RECT_CHANNEL_SPECS;
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
        return RECT_SHADER_BODY;
    }

    /**
     * @param {string} name
     * @returns {[number, number] | undefined}
     */
    getDefaultScaleRange(name) {
        if (!this.renderer?._globals) {
            return undefined;
        }
        if (name === "x" || name === "x2") {
            return [0, this.renderer._globals.width];
        }
        if (name === "y" || name === "y2") {
            return [0, this.renderer._globals.height];
        }
        return undefined;
    }
}
