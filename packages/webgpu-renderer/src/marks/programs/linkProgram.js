import BaseProgram from "./baseProgram.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigInput} ChannelConfigInput
 */

const LINK_SHAPES = ["arc", "dome", "diagonal", "line"];
const ORIENTS = ["vertical", "horizontal"];

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const LINK_CHANNEL_SPECS = {
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { type: "f32", components: 1 },
    x2: { type: "f32", components: 1 },
    y: { type: "f32", components: 1 },
    y2: { type: "f32", components: 1 },
    size: { type: "f32", components: 1, default: 1.0 },
    color: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    opacity: { type: "f32", components: 1, default: 1.0 },
};

const {
    channels: CHANNELS,
    defaults: DEFAULTS,
    defaultConfigs: DEFAULT_CHANNEL_CONFIGS,
    optionalChannels: OPTIONAL_CHANNELS,
} = buildChannelMaps(LINK_CHANNEL_SPECS);

const LINK_SHADER_BODY = /* wgsl */ `
const SHAPE_ARC: u32 = 0u;
const SHAPE_DOME: u32 = 1u;
const SHAPE_DIAGONAL: u32 = 2u;
const SHAPE_LINE: u32 = 3u;
const ORIENT_VERTICAL: u32 = 0u;
const ORIENT_HORIZONTAL: u32 = 1u;

struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normalDistance: f32,
    @location(2) size: f32,
};

fn distanceFromLine(a: vec2<f32>, b: vec2<f32>, p: vec2<f32>) -> f32 {
    let ap = p - a;
    let ab = b - a;
    let proj = dot(ap, ab) / dot(ab, ab) * ab;
    return length(ap - proj);
}

fn isInsideViewport(p: vec2<f32>, marginFactor: f32) -> bool {
    let margin = vec2<f32>(globals.width, globals.height) * vec2<f32>(marginFactor);
    return p.x >= -margin.x &&
        p.x <= globals.width + margin.x &&
        p.y >= -margin.y &&
        p.y <= globals.height + margin.y;
}

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

    let local = quad[v % 6u];
    let segment = v / 6u;
    let segmentCount = max(1u, u32(params.uSegmentBreaks));
    let tRaw = (f32(segment) + local.x) / f32(segmentCount);
    let t = smoothstep(0.0, 1.0, tRaw);

    let pixelSize = 1.0 / globals.dpr;
    var opacity = getScaled_opacity(i);

    // The bezier's control points
    var p1: vec2<f32>;
    var p2: vec2<f32>;
    var p3: vec2<f32>;
    var p4: vec2<f32>;

    let a = vec2<f32>(getScaled_x(i), getScaled_y(i));
    let b = vec2<f32>(getScaled_x2(i), getScaled_y2(i));

    if (params.uShape <= SHAPE_DOME) {
        if (params.uShape == SHAPE_DOME) {
            var height = vec2<f32>(0.0, 0.0);
            if (params.uOrient == ORIENT_VERTICAL) {
                p1 = vec2<f32>(min(a.x, b.x), b.y);
                p4 = vec2<f32>(max(a.x, b.x), b.y);
                height = vec2<f32>(0.0, a.y - b.y);

                if (params.uClampApex != 0u) {
                    if (p4.x > 0.0) {
                        p1.x = max(p1.x, -p4.x);
                    }
                    if (p1.x < globals.width) {
                        p4.x = min(p4.x, 2.0 * globals.width - p1.x);
                    }
                }
            } else {
                p1 = vec2<f32>(b.x, min(a.y, b.y));
                p4 = vec2<f32>(b.x, max(a.y, b.y));
                height = vec2<f32>(a.x - b.x, 0.0);

                if (params.uClampApex != 0u) {
                    if (p4.y > 0.0) {
                        p1.y = max(p1.y, -p4.y);
                    }
                    if (p1.y < globals.height) {
                        p4.y = min(p4.y, 2.0 * globals.height - p1.y);
                    }
                }
            }

            let controlOffset = height / 0.75;
            p2 = p1 + controlOffset;
            p3 = p4 + controlOffset;
        } else if (params.uShape == SHAPE_ARC) {
            p1 = a;
            p4 = b;

            var chordVector = p4 - p1;
            let unitChordVector = normalize(chordVector);
            let chordNormal = vec2<f32>(-unitChordVector.y, unitChordVector.x);
            var chordLength = length(chordVector);

            if (chordLength > params.uMaxChordLength) {
                if (isInsideViewport(p1, 2.0)) {
                    chordLength = params.uMaxChordLength;
                    p4 = p1 + unitChordVector * params.uMaxChordLength;
                } else if (isInsideViewport(p4, 2.0)) {
                    chordLength = params.uMaxChordLength;
                    p1 = p4 - unitChordVector * params.uMaxChordLength;
                }
            }

            let height = max(chordLength / 2.0 * params.uArcHeightFactor, params.uMinArcHeight);
            let controlOffset = chordNormal * height / 0.75;

            p2 = p1 + controlOffset;
            p3 = p4 + controlOffset;
        }
    } else if (params.uShape == SHAPE_DIAGONAL) {
        if (params.uOrient == ORIENT_VERTICAL) {
            p1 = a;
            p2 = vec2<f32>(a.x, (a.y + b.y) / 2.0);
            p3 = vec2<f32>(b.x, (a.y + b.y) / 2.0);
            p4 = b;
        } else {
            p1 = a;
            p2 = vec2<f32>((a.x + b.x) / 2.0, a.y);
            p3 = vec2<f32>((a.x + b.x) / 2.0, b.y);
            p4 = b;
        }
    } else if (params.uShape == SHAPE_LINE) {
        p1 = a;
        p2 = (a + b) / 2.0;
        p3 = p2;
        p4 = b;
    }

    let c1 = p4 - 3.0 * p3 + 3.0 * p2 - p1;
    let c2 = 3.0 * p3 - 6.0 * p2 + 3.0 * p1;
    let c3 = 3.0 * p2 - 3.0 * p1;
    let c4 = p1;

    var p: vec2<f32>;
    if (t == 0.0) {
        p = p1;
    } else if (t == 1.0) {
        p = p4;
    } else {
        p = c1 * t * t * t + c2 * t * t + c3 * t + c4;
    }

    let tangent = normalize(3.0 * c1 * t * t + 2.0 * c2 * t + c3);
    let normal = vec2<f32>(-tangent.y, tangent.x);

    var size = getScaled_size(i);
    if (size < pixelSize) {
        opacity *= size / pixelSize;
        size = pixelSize;
    }

    let paddedSize = size + pixelSize;
    var normalDistance = (local.y - 0.5) * paddedSize;

    if (params.uShape == SHAPE_ARC &&
        params.uArcFadingDistance.x > 0.0 &&
        params.uArcFadingDistance.y > 0.0)
    {
        let d = distanceFromLine(p1, p4, p);
        let distanceOpacity = smoothstep(params.uArcFadingDistance.y, params.uArcFadingDistance.x, d);
        opacity *= distanceOpacity;
        if (distanceOpacity <= 0.0) {
            normalDistance = 0.0;
        }
    }

    p = p + normal * normalDistance;

    let clip = vec2<f32>(
        (p.x / globals.width) * 2.0 - 1.0,
        1.0 - (p.y / globals.height) * 2.0
    );

    var out: VSOut;
    out.pos = vec4<f32>(clip, 0.0, 1.0);
    let color = getScaled_color(i);
    out.color = vec4<f32>(color.rgb * opacity, color.a * opacity);
    out.normalDistance = normalDistance;
    out.size = paddedSize;
    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    let distance = abs(in.normalDistance);
    let alpha = clamp(((in.size * 0.5 - distance) * globals.dpr), 0.0, 1.0);
    return in.color * alpha;
}
`;

export default class LinkProgram extends BaseProgram {
    get channelOrder() {
        return CHANNELS;
    }

    get optionalChannels() {
        return OPTIONAL_CHANNELS;
    }

    get channelSpecs() {
        return LINK_CHANNEL_SPECS;
    }

    get defaultChannelConfigs() {
        return DEFAULT_CHANNEL_CONFIGS;
    }

    get defaultValues() {
        return DEFAULTS;
    }

    get shaderBody() {
        return LINK_SHADER_BODY;
    }

    getExtraUniformLayout() {
        /** @type {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4 }[]} */
        const layout = [
            { name: "uArcFadingDistance", type: "f32", components: 2 },
            { name: "uArcHeightFactor", type: "f32", components: 1 },
            { name: "uMinArcHeight", type: "f32", components: 1 },
            { name: "uShape", type: "u32", components: 1 },
            { name: "uOrient", type: "u32", components: 1 },
            { name: "uClampApex", type: "u32", components: 1 },
            { name: "uMaxChordLength", type: "f32", components: 1 },
            { name: "uSegmentBreaks", type: "f32", components: 1 },
        ];
        return layout;
    }

    _initializeExtraUniforms() {
        /** @type {import("../../index.d.ts").LinkMarkOptions} */
        const props =
            /** @type {import("../../index.d.ts").LinkMarkOptions} */ (
                this._markConfig ?? {}
            );
        const arcFading =
            Array.isArray(props.arcFadingDistance) &&
            props.arcFadingDistance.length === 2
                ? props.arcFadingDistance
                : [0, 0];
        const arcHeightFactor =
            typeof props.arcHeightFactor === "number"
                ? props.arcHeightFactor
                : 1.0;
        const minArcHeight =
            typeof props.minArcHeight === "number" ? props.minArcHeight : 1.5;
        const maxChordLength =
            typeof props.maxChordLength === "number"
                ? props.maxChordLength
                : 50000;
        const clampApex = props.clampApex ? 1 : 0;
        const segments =
            typeof props.segments === "number" && props.segments > 0
                ? Math.round(props.segments)
                : 101;
        const shapeIndex = LINK_SHAPES.indexOf(props.linkShape ?? "arc");
        const orientIndex = ORIENTS.indexOf(props.orient ?? "vertical");

        this._segmentCount = segments;

        this._setUniformValue("uArcFadingDistance", arcFading);
        this._setUniformValue("uArcHeightFactor", arcHeightFactor);
        this._setUniformValue("uMinArcHeight", minArcHeight);
        this._setUniformValue("uShape", shapeIndex >= 0 ? shapeIndex : 0);
        this._setUniformValue("uOrient", orientIndex >= 0 ? orientIndex : 0);
        this._setUniformValue("uClampApex", clampApex);
        this._setUniformValue("uMaxChordLength", maxChordLength);
        this._setUniformValue("uSegmentBreaks", segments);
    }

    /**
     * @param {GPURenderPassEncoder} pass
     */
    draw(pass) {
        const vertexCount = Math.max(1, this._segmentCount ?? 1) * 6;
        pass.setPipeline(this._pipeline);
        pass.setBindGroup(0, this.renderer._globalBindGroup);
        pass.setBindGroup(1, this._bindGroup);
        pass.draw(vertexCount, this.count, 0, 0);
    }
}
