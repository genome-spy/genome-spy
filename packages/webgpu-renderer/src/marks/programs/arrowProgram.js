import BaseProgram from "./internal/baseProgram.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";

/** @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const ARROW_CHANNEL_SPECS = {
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { type: "f32", components: 1 },
    x2: { type: "f32", components: 1 },
    y: { type: "f32", components: 1 },
    y2: { type: "f32", components: 1 },
    xOffset: { type: "f32", components: 1, default: 0 },
    x2Offset: { type: "f32", components: 1, default: 0 },
    yOffset: { type: "f32", components: 1, default: 0 },
    y2Offset: { type: "f32", components: 1, default: 0 },
    fill: { type: "f32", components: 4, default: [0, 0, 0, 1] },
    stroke: { type: "f32", components: 4, default: [0, 0, 0, 1] },
    fillOpacity: { type: "f32", components: 1, default: 1 },
    strokeOpacity: { type: "f32", components: 1, default: 1 },
    strokeWidth: { type: "f32", components: 1, default: 1 },
    size: { type: "f32", components: 1, default: 8 },
    direction: { type: "u32", components: 1, default: 0 },
};

const {
    channels: CHANNELS,
    defaults: DEFAULTS,
    defaultConfigs: DEFAULT_CHANNEL_CONFIGS,
    optionalChannels: OPTIONAL_CHANNELS,
} = buildChannelMaps(ARROW_CHANNEL_SPECS);

const ARROW_SHADER_BODY = /* wgsl */ `
const DIRECTION_FORWARD: u32 = 0u;
const HEAD_TRIANGLE: u32 = 0u;
const HEAD_OPEN: u32 = 1u;
const PLACEMENT_INSIDE: u32 = 0u;

struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) @interpolate(flat) halfLength: f32,
    @location(2) @interpolate(flat) headHalfWidth: f32,
    @location(3) @interpolate(flat) stemHalfWidth: f32,
    @location(4) @interpolate(flat) headSlope: f32,
    @location(5) @interpolate(flat) notchSlope: f32,
    @location(6) @interpolate(flat) fill: vec4<f32>,
    @location(7) @interpolate(flat) stroke: vec4<f32>,
    @location(8) @interpolate(flat) strokeWidth: f32,
    @location(9) @interpolate(flat) direction: u32,
    @location(10) @interpolate(flat) headShape: u32,
    @location(11) @interpolate(flat) headSpacing: f32,
};

fn culledArrow() -> VSOut {
    var out: VSOut;
    out.pos = vec4<f32>(0.0);
    out.local = vec2<f32>(0.0);
    out.halfLength = 0.0;
    out.headHalfWidth = 0.0;
    out.stemHalfWidth = 0.0;
    out.headSlope = 0.0;
    out.notchSlope = 0.0;
    out.fill = vec4<f32>(0.0);
    out.stroke = vec4<f32>(0.0);
    out.strokeWidth = 0.0;
    out.direction = 0u;
    out.headShape = 0u;
    out.headSpacing = 0.0;
    return out;
}

fn distanceToRatio(d: f32) -> f32 {
    return clamp(d * globals.dpr + 0.5, 0.0, 1.0);
}

fn distanceToColor(d: f32, fill: vec4<f32>, stroke: vec4<f32>, halfStroke: f32) -> vec4<f32> {
    let fillColor = premultiplyAlpha(fill);
    let strokeColor = premultiplyAlpha(stroke);
    if (halfStroke > 0.0) {
        return mix(strokeColor, select(vec4<f32>(0.0), fillColor, d <= 0.0),
            distanceToRatio(abs(d) - halfStroke));
    }
    return fillColor * distanceToRatio(-d);
}

fn boxDistance(p: vec2<f32>, halfSize: vec2<f32>) -> f32 {
    let q = abs(p) - halfSize;
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0);
}

fn segmentDistance(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let ab = b - a;
    let t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
    return length(p - (a + t * ab));
}

fn stemDistance(p: vec2<f32>, halfLength: f32, halfWidth: f32, notchSlope: f32) -> f32 {
    if (halfWidth <= 0.0) {
        return 1e20;
    }
    var notchLength = 0.0;
    if (params.uStartNotch != 0u) {
        notchLength = min(halfWidth * notchSlope, max(2.0 * halfLength - params.uMinStemLength, 0.0));
    }
    return polygonDistance(
        p,
        array<vec2<f32>, 6>(
            vec2<f32>(-halfLength, 0.0),
            vec2<f32>(-halfLength + notchLength, halfWidth),
            vec2<f32>(halfLength, halfWidth),
            vec2<f32>(halfLength, -halfWidth),
            vec2<f32>(-halfLength + notchLength, -halfWidth),
            vec2<f32>(-halfLength, 0.0)
        )
    );
}

fn polygonDistance(p: vec2<f32>, vertices: array<vec2<f32>, 6>) -> f32 {
    var distance = length(p - vertices[0]);
    var inside = false;
    for (var i = 0u; i < 6u; i++) {
        let j = (i + 1u) % 6u;
        let a = vertices[i];
        let b = vertices[j];
        let edge = b - a;
        let projection = a + edge * clamp(dot(p - a, edge) / max(dot(edge, edge), 0.0001), 0.0, 1.0);
        distance = min(distance, length(p - projection));
        if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / max(b.y - a.y, 0.0001) + a.x) {
            inside = !inside;
        }
    }
    return select(distance, -distance, inside);
}

fn triangleDistance(p: vec2<f32>, tip: f32, base: f32, halfWidth: f32, notchSlope: f32) -> f32 {
    if (halfWidth <= 0.0) {
        return 1e20;
    }
    let notch = vec2<f32>(tip - halfWidth * notchSlope, 0.0);
    return polygonDistance(
        p,
        array<vec2<f32>, 6>(
            vec2<f32>(tip, 0.0),
            vec2<f32>(base, halfWidth),
            notch,
            vec2<f32>(base, -halfWidth),
            vec2<f32>(tip, 0.0),
            vec2<f32>(tip, 0.0)
        )
    );
}

fn headDistance(p: vec2<f32>, tip: f32, halfWidth: f32, slope: f32, notchSlope: f32, shape: u32) -> f32 {
    let axisLength = halfWidth * slope;
    let base = tip - axisLength;
    let triangle = triangleDistance(p, tip, base, halfWidth, notchSlope);
    if (shape == HEAD_TRIANGLE) {
        return triangle;
    }
    return min(
        segmentDistance(p, vec2<f32>(tip, 0.0), vec2<f32>(base, halfWidth)),
        segmentDistance(p, vec2<f32>(tip, 0.0), vec2<f32>(base, -halfWidth))
    );
}

fn shade(in: VSOut) -> vec4<f32> {
    var p = in.local;
    if (in.direction != DIRECTION_FORWARD) {
        p.x = -p.x;
    }

    let halfStroke = in.strokeWidth * 0.5;
    var stem = 1e20;
    if (in.stemHalfWidth > 0.0) {
        stem = stemDistance(p, in.halfLength, in.stemHalfWidth, in.notchSlope);
    }

    var head = headDistance(
        p,
        in.halfLength + select(0.0, in.headHalfWidth * in.headSlope, params.uHeadPlacement != PLACEMENT_INSIDE),
        in.headHalfWidth,
        in.headSlope,
        in.notchSlope,
        in.headShape
    );
    if (in.headSpacing >= 0.0) {
        for (var n = 1u; n < 64u; n++) {
            let tip = in.halfLength - f32(n) * in.headSpacing;
            if (tip < -in.halfLength) {
                break;
            }
            head = min(head, headDistance(p, tip, in.headHalfWidth, in.headSlope, in.notchSlope, in.headShape));
        }
    }

    let d = min(stem, head);
    var fill = in.fill;
    var stroke = in.stroke;
    return distanceToColor(d, fill, stroke, halfStroke);
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    if (!isInstanceVisible(i)) {
        return culledArrow();
    }

    var quad = array<vec2<f32>, 6>(
        vec2<f32>(0, 0), vec2<f32>(1, 0), vec2<f32>(0, 1),
        vec2<f32>(0, 1), vec2<f32>(1, 0), vec2<f32>(1, 1)
    );
    let local = quad[v];
    let a = vec2<f32>(getScaled_x(i) + getScaled_xOffset(i), getScaled_y(i) + getScaled_yOffset(i));
    let b = vec2<f32>(getScaled_x2(i) + getScaled_x2Offset(i), getScaled_y2(i) + getScaled_y2Offset(i));
    var tangent = b - a;
    let lengthInPixels = length(tangent);
    if (lengthInPixels == 0.0) {
        tangent = vec2<f32>(1, 0);
    }
    let axis = normalize(tangent);
    let normal = vec2<f32>(-axis.y, axis.x);
    let arrowSize = max(getScaled_size(i), params.uMinSize);
    let headHalfWidth = max(params.uHeadWidth * arrowSize * 0.5, 0.0);
    let stemHalfWidth = select(-arrowSize * 0.5, arrowSize * 0.5, params.uStem != 0u);
    let headAxisLength = headHalfWidth * params.uHeadSlope;
    let padding = 1.0 / globals.dpr + getScaled_strokeWidth(i) * 0.5 + max(headHalfWidth, abs(stemHalfWidth));
    let halfLength = lengthInPixels * 0.5 + padding;
    let centre = (a + b) * 0.5;
    let axisPosition = (local.x - 0.5) * (halfLength * 2.0);
    let normalPosition = (local.y - 0.5) * (max(headHalfWidth, abs(stemHalfWidth)) * 2.0 + padding * 2.0);
    let position = centre + axis * axisPosition + normal * normalPosition;
    let clip = vec2<f32>((position.x / globals.width) * 2.0 - 1.0, 1.0 - (position.y / globals.height) * 2.0);
    var out: VSOut;
    out.pos = vec4<f32>(clip, 0.0, 1.0);
    out.local = vec2<f32>(axisPosition, normalPosition);
    out.halfLength = halfLength;
    out.headHalfWidth = headHalfWidth;
    out.stemHalfWidth = stemHalfWidth;
    out.headSlope = params.uHeadSlope;
    out.notchSlope = params.uHeadNotchSlope;
    let fill = getScaled_fill(i);
    let stroke = getScaled_stroke(i);
    out.fill = vec4<f32>(fill.rgb, fill.a * getScaled_fillOpacity(i));
    out.stroke = vec4<f32>(stroke.rgb, stroke.a * getScaled_strokeOpacity(i));
    out.strokeWidth = getScaled_strokeWidth(i);
    out.direction = u32(getScaled_direction(i));
    out.headShape = params.uHeadShape;
    out.headSpacing = select(-1.0, params.uHeadSpacing * arrowSize, params.uHeadSpacing >= 0.0);
    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return shade(in);
}
`;

export default class ArrowProgram extends BaseProgram {
    get channelOrder() {
        return CHANNELS;
    }

    get optionalChannels() {
        return OPTIONAL_CHANNELS;
    }

    get channelSpecs() {
        return ARROW_CHANNEL_SPECS;
    }

    get defaultChannelConfigs() {
        return DEFAULT_CHANNEL_CONFIGS;
    }

    get defaultValues() {
        return DEFAULTS;
    }

    get shaderBody() {
        return ARROW_SHADER_BODY;
    }

    /** @returns {GPUPrimitiveTopology} */
    get primitiveTopology() {
        return "triangle-list";
    }

    /** @returns {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4 }[]} */
    getExtraUniformLayout() {
        return [
            { name: "uHeadSlope", type: "f32", components: 1 },
            { name: "uHeadNotchSlope", type: "f32", components: 1 },
            { name: "uMinSize", type: "f32", components: 1 },
            { name: "uHeadWidth", type: "f32", components: 1 },
            { name: "uStartNotch", type: "u32", components: 1 },
            { name: "uMinStemLength", type: "f32", components: 1 },
            { name: "uHeadSpacing", type: "f32", components: 1 },
            { name: "uStem", type: "u32", components: 1 },
            { name: "uHeadShape", type: "u32", components: 1 },
            { name: "uHeadPlacement", type: "u32", components: 1 },
        ];
    }

    _initializeExtraUniforms() {
        const props = /** @type {Record<string, any>} */ (
            this._markConfig ?? {}
        );
        this._setUniformValue("uHeadSlope", props.headAngle ?? 1);
        this._setUniformValue("uHeadNotchSlope", props.headNotchAngle ?? 1);
        this._setUniformValue("uMinSize", props.minSize ?? 1);
        this._setUniformValue("uHeadWidth", props.headWidth ?? 3);
        this._setUniformValue("uStartNotch", props.startNotch ? 1 : 0);
        this._setUniformValue("uMinStemLength", props.minStemLength ?? 0);
        this._setUniformValue("uHeadSpacing", props.headSpacing ?? -1);
        this._setUniformValue("uStem", props.stem === false ? 0 : 1);
        this._setUniformValue("uHeadShape", props.headShape ?? 0);
        this._setUniformValue("uHeadPlacement", props.headPlacement ?? 0);
    }

    /**
     * @param {GPURenderPassEncoder} pass
     * @param {import("../../index.d.ts").ProgramDrawOptions} options
     */
    draw(pass, options) {
        pass.setPipeline(this._pipeline);
        pass.setBindGroup(1, this._bindGroup);
        pass.draw(6, options.instanceCount, 0, options.firstInstance);
    }
}
