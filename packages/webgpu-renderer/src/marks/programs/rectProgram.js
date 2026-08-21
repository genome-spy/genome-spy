import BaseProgram from "./internal/baseProgram.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";
import { linearScale } from "../../scales/linear.js";

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const RECT_CHANNEL_SPECS = {
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { type: "f32", components: 1, scale: linearScale(), default: 0 },
    x2: { type: "f32", components: 1, scale: linearScale(), default: 10 },
    y: { type: "f32", components: 1, scale: linearScale(), default: 0 },
    y2: { type: "f32", components: 1, scale: linearScale(), default: 10 },
    xOffset: { type: "f32", components: 1, default: 0 },
    x2Offset: { type: "f32", components: 1, default: 0 },
    yOffset: { type: "f32", components: 1, default: 0 },
    y2Offset: { type: "f32", components: 1, default: 0 },
    fill: { type: "f32", components: 4, default: [0.27, 0.49, 0.8, 1.0] },
    stroke: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    fillOpacity: { type: "f32", components: 1, default: 1.0 },
    strokeOpacity: { type: "f32", components: 1, default: 1.0 },
    strokeWidth: { type: "f32", components: 1, default: 1.0 },
    cornerRadiusTopRight: { type: "f32", components: 1, default: 0.0 },
    cornerRadiusBottomRight: { type: "f32", components: 1, default: 0.0 },
    cornerRadiusTopLeft: { type: "f32", components: 1, default: 0.0 },
    cornerRadiusBottomLeft: { type: "f32", components: 1, default: 0.0 },
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

fn sdRoundedBox(p: vec2<f32>, b: vec2<f32>, r: vec4<f32>) -> f32 {
    let pair = select(r.zw, r.xy, p.x > 0.0);
    let radius = select(pair.y, pair.x, p.y > 0.0);
    let q = abs(p) - b + radius;
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - radius;
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

fn gaussian(x: f32, sigma: f32) -> f32 {
    let pi = 3.141592653589793;
    return exp(-(x * x) / (2.0 * sigma * sigma)) /
        (sqrt(2.0 * pi) * sigma);
}

fn erf(x: vec2<f32>) -> vec2<f32> {
    let s = sign(x);
    var a = abs(x);
    a = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    a = a * a;
    return s - s / (a * a);
}

fn roundedBoxShadowX(
    x: f32,
    y: f32,
    sigma: f32,
    corner: f32,
    halfSize: vec2<f32>
) -> f32 {
    let delta = min(halfSize.y - corner - abs(y), 0.0);
    let curved = halfSize.x - corner +
        sqrt(max(0.0, corner * corner - delta * delta));
    let integral = 0.5 + 0.5 * erf((x + vec2<f32>(-curved, curved)) *
        (sqrt(0.5) / sigma));
    return integral.y - integral.x;
}

fn roundedBoxShadow(
    lower: vec2<f32>,
    upper: vec2<f32>,
    point: vec2<f32>,
    sigma: f32,
    corner: f32
) -> f32 {
    let center = (lower + upper) * 0.5;
    let halfSize = (upper - lower) * 0.5;
    let centeredPoint = point - center;
    let low = centeredPoint.y - halfSize.y;
    let high = centeredPoint.y + halfSize.y;
    let start = clamp(-3.0 * sigma, low, high);
    let end = clamp(3.0 * sigma, low, high);
    let sampleStep = (end - start) / 4.0;
    var y = start + sampleStep * 0.5;
    var value = 0.0;
    for (var i = 0; i < 4; i++) {
        value += roundedBoxShadowX(
            centeredPoint.x,
            centeredPoint.y - y,
            sigma,
            corner,
            halfSize
        ) * gaussian(y, sigma) * sampleStep;
        y += sampleStep;
    }
    return value;
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
    @location(7) cornerRadii: vec4<f32>,
    @location(8) shadowOffset: vec2<f32>,
    @location(9) shadowBlur: f32,
    @location(10) shadowOpacity: f32,
    @location(11) shadowColor: vec4<f32>,
    @location(12) @interpolate(flat) hatchPattern: u32,
    @location(13) @interpolate(flat) pickId: u32,
};

fn culledRect() -> VSOut {
    var out: VSOut;
    out.pos = vec4<f32>(0.0);
    out.local = vec2<f32>(0.0);
    out.size = vec2<f32>(0.0);
    out.fill = vec4<f32>(0.0);
    out.stroke = vec4<f32>(0.0);
    out.fillOpacity = 0.0;
    out.strokeOpacity = 0.0;
    out.strokeWidth = 0.0;
    out.cornerRadii = vec4<f32>(0.0);
    out.shadowOffset = vec2<f32>(0.0);
    out.shadowBlur = 0.0;
    out.shadowOpacity = 0.0;
    out.shadowColor = vec4<f32>(0.0);
    out.hatchPattern = 0u;
    out.pickId = 0u;
    return out;
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    if (!isInstanceVisible(i)) {
        return culledRect();
    }

    var quad = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0)
    );

    var x = getScaled_x(i) + getScaled_xOffset(i);
    var x2 = getScaled_x2(i) + getScaled_x2Offset(i);
    var y = getScaled_y(i) + getScaled_yOffset(i);
    var y2 = getScaled_y2(i) + getScaled_y2Offset(i);
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

    // Keep the SDF decoration outside the nominal rectangle. WebGL expands
    // decorated rects for stroke antialiasing and the shadow kernel's support.
    let strokeWidth = getScaled_strokeWidth(i);
    let shadowOffset = vec2<f32>(
        getScaled_shadowOffsetX(i),
        getScaled_shadowOffsetY(i)
    );
    let shadowBlur = getScaled_shadowBlur(i);
    let shadowPadding = shadowBlur + max(abs(shadowOffset.x), abs(shadowOffset.y));
    let decorationPadding = strokeWidth + 1.0 / globals.dpr + shadowPadding * 2.0;
    let centeredFrac = local - vec2<f32>(0.5);
    let expansion = centeredFrac * decorationPadding;
    px += expansion.x;
    py += expansion.y;

    let clip = vec2<f32>(
        (px / globals.width) * 2.0 - 1.0,
        1.0 - (py / globals.height) * 2.0
    );

    var out: VSOut;
    out.pos = vec4<f32>(clip, 0.0, 1.0);
    out.local = centeredFrac * vec2<f32>(w, h) + expansion;
    out.size = vec2<f32>(w, h);
    out.fill = getScaled_fill(i);
    out.stroke = getScaled_stroke(i);
    out.fillOpacity = getScaled_fillOpacity(i) * opaFactor;
    out.strokeOpacity = getScaled_strokeOpacity(i) * opaFactor;
    out.strokeWidth = strokeWidth;
    let halfMinSize = min(w, h) * 0.5;
    out.cornerRadii = min(
        vec4<f32>(
            getScaled_cornerRadiusTopRight(i),
            getScaled_cornerRadiusBottomRight(i),
            getScaled_cornerRadiusTopLeft(i),
            getScaled_cornerRadiusBottomLeft(i)
        ),
        vec4<f32>(halfMinSize)
    );
    out.shadowOffset = shadowOffset;
    out.shadowBlur = shadowBlur;
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
    var fillColor = in.fill;
    fillColor.a = fillColor.a * in.fillOpacity;
    fillColor = premultiplyAlpha(fillColor);

    // Adjacent plain rectangles must share an exact rasterized edge. Applying
    // SDF coverage here would introduce translucent seams in dense heatmaps.
    if (all(in.cornerRadii <= vec4<f32>(0.0)) && in.strokeWidth <= 0.0 &&
            in.shadowOpacity <= 0.0 && in.hatchPattern == 0u) {
        return fillColor;
    }

    let halfSize = in.size * 0.5;
    let centered = in.local;
    var d = sdRoundedBox(centered, halfSize, in.cornerRadii);

    var strokeColor = in.stroke;
    strokeColor.a = strokeColor.a * in.strokeOpacity;
    strokeColor = premultiplyAlpha(strokeColor);

    var background = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (in.shadowOpacity > 0.0) {
        let maxCornerRadius = max(
            in.cornerRadii.x,
            max(in.cornerRadii.y, max(in.cornerRadii.z, in.cornerRadii.w))
        );
        let sigma = max(in.shadowBlur / 2.5, 0.25);
        if (d >= in.strokeWidth * 0.5 - 1.0) {
            let shadow = roundedBoxShadow(
                -halfSize - vec2<f32>(in.strokeWidth * 0.5),
                halfSize + vec2<f32>(in.strokeWidth * 0.5),
                centered - in.shadowOffset,
                sigma,
                maxCornerRadius + in.strokeWidth * 0.5
            ) * in.shadowOpacity;
            background = vec4<f32>(in.shadowColor.rgb * shadow, shadow);
        }
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
