import BaseProgram from "./internal/baseProgram.js";
import { initializePropertySlots } from "./internal/propertySlots.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 */

const LINK_SHAPES = ["arc", "dome", "diagonal", "line"];
const ORIENTS = ["vertical", "horizontal"];

/** @param {string} value */
function encodeLinkShape(value) {
    const index = LINK_SHAPES.indexOf(value);
    if (index < 0) {
        throw new Error(`Unknown link shape: ${String(value)}`);
    }
    return index;
}

/** @param {string} value */
function encodeOrient(value) {
    const index = ORIENTS.indexOf(value);
    if (index < 0) {
        throw new Error(`Unknown link orientation: ${String(value)}`);
    }
    return index;
}

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const LINK_CHANNEL_SPECS = {
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
#if defined(PLACEMENT_ENABLED)
    @location(15) @interpolate(flat) placementClip: vec4<f32>,
#endif
    @builtin(position) pos: vec4<f32>,
    @location(0) color: vec4<f32>,
    // Signed distance from the line center along the normal, in pixels.
    @location(1) normalDistance: f32,
    // Stroke width in pixels (with AA padding baked in).
    @location(2) size: f32,
    @location(3) @interpolate(flat) pickId: u32,
};

fn culledLink() -> VSOut {
    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = vec4<f32>(-1e9);
#endif
    out.pos = vec4<f32>(0.0);
    out.color = vec4<f32>(0.0);
    out.normalDistance = 0.0;
    out.size = 0.0;
    out.pickId = 0u;
    return out;
}

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

fn inverseSmoothstep(t: f32) -> f32 {
    let clamped = clamp(t, 0.0, 1.0);
    return 0.5 - sin(asin(1.0 - 2.0 * clamped) / 3.0);
}

fn remapVisibleChordParameter(
    stripT: f32,
    chordStart: f32,
    chordEnd: f32,
    viewportLength: f32
) -> f32 {
    let chordMin = min(chordStart, chordEnd);
    let chordMax = max(chordStart, chordEnd);
    let chordSpan = chordMax - chordMin;
    if (chordSpan <= 0.0) {
        return 0.0;
    }

    let visibleChordMin = max(chordMin, 0.0);
    let visibleChordMax = min(chordMax, viewportLength);
    if (visibleChordMax <= visibleChordMin) {
        return stripT;
    }

    let visibleTMin = inverseSmoothstep(
        (visibleChordMin - chordMin) / chordSpan
    );
    let visibleTMax = inverseSmoothstep(
        (visibleChordMax - chordMin) / chordSpan
    );
    let visibleTSpan = visibleTMax - visibleTMin;
    let offscreenTSpan = visibleTMin + (1.0 - visibleTMax);
    if (offscreenTSpan <= 0.0) {
        return stripT;
    }

    let visibleShare = clamp(0.75 + (1.0 - visibleTSpan) * 0.2, 0.75, 0.95);
    let offscreenShare = 1.0 - visibleShare;
    let leftShare = offscreenShare * visibleTMin / offscreenTSpan;
    let rightShare = offscreenShare * (1.0 - visibleTMax) / offscreenTSpan;

    if (stripT <= leftShare) {
        if (leftShare > 0.0) {
            return mix(0.0, visibleTMin, stripT / leftShare);
        }
        return visibleTMin;
    }

    let visibleStart = leftShare;
    let visibleEnd = visibleStart + visibleShare;
    if (stripT <= visibleEnd) {
        if (visibleShare > 0.0) {
            return mix(
                visibleTMin,
                visibleTMax,
                (stripT - visibleStart) / visibleShare
            );
        }
        return visibleTMin;
    }

    if (rightShare > 0.0) {
        return mix(visibleTMax, 1.0, (stripT - visibleEnd) / rightShare);
    }
    return visibleTMax;
}

fn clampChordToViewport(
    p1: ptr<function, vec2<f32>>,
    p4: ptr<function, vec2<f32>>,
    chordLength: ptr<function, f32>
) {
    if (*chordLength > params.uMaxChordLength) {
        let chordVector = *p4 - *p1;
        let unitChordVector = normalize(chordVector);
        if (isInsideViewport(*p1, 2.0)) {
            (*chordLength) = params.uMaxChordLength;
            (*p4) = *p1 + unitChordVector * params.uMaxChordLength;
        } else if (isInsideViewport(*p4, 2.0)) {
            (*chordLength) = params.uMaxChordLength;
            (*p1) = *p4 - unitChordVector * params.uMaxChordLength;
        }
    }
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    if (!isInstanceVisible(i) || !isPlacementVisible(i)) {
        return culledLink();
    }

    let segment = v / 2u;
    let side = f32(v % 2u) - 0.5;
    let segmentCount = max(1u, u32(params.uSegmentBreaks));
    let tRaw = f32(segment) / f32(segmentCount);
    var t = tRaw;

    let pixelSize = 1.0 / globals.dpr;
    var opacity = getScaled_opacity(i);

    // The bezier's control points.
    var p1: vec2<f32>;
    var p2: vec2<f32>;
    var p3: vec2<f32>;
    var p4: vec2<f32>;

    let a = vec2<f32>(
        getScaled_x(i) + getScaled_xOffset(i),
        getScaled_y(i) + getScaled_yOffset(i)
    );
    let b = vec2<f32>(
        getScaled_x2(i) + getScaled_x2Offset(i),
        getScaled_y2(i) + getScaled_y2Offset(i)
    );

    if (params.uShape <= SHAPE_DOME) {
        if (params.uShape == SHAPE_DOME) {
            var height = vec2<f32>(0.0, 0.0);
            if (params.uOrient == ORIENT_VERTICAL) {
                p1 = vec2<f32>(min(a.x, b.x), b.y);
                p4 = vec2<f32>(max(a.x, b.x), b.y);
                height = vec2<f32>(0.0, a.y - b.y);
            } else {
                p1 = vec2<f32>(b.x, min(a.y, b.y));
                p4 = vec2<f32>(b.x, max(a.y, b.y));
                height = vec2<f32>(a.x - b.x, 0.0);
            }

            var chordLength = length(p4 - p1);
            clampChordToViewport(&p1, &p4, &chordLength);
            if (params.uClampApex != 0u) {
                if (params.uOrient == ORIENT_VERTICAL) {
                    if (p4.x > 0.0) {
                        p1.x = max(p1.x, -p4.x);
                    }
                    if (p1.x < globals.width) {
                        p4.x = min(p4.x, 2.0 * globals.width - p1.x);
                    }
                } else {
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
            // Core's WebGL link geometry is expressed in bottom-left
            // coordinates. WebGPU positions use top-left coordinates, so the
            // arc normal must be inverted to keep the bow on the same side.
            let chordNormal = vec2<f32>(unitChordVector.y, -unitChordVector.x);
            var chordLength = length(chordVector);

            clampChordToViewport(&p1, &p4, &chordLength);

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

    if (params.uShape == SHAPE_DOME) {
        if (params.uOrient == ORIENT_VERTICAL) {
            t = remapVisibleChordParameter(tRaw, p1.x, p4.x, globals.width);
        } else {
            t = remapVisibleChordParameter(tRaw, p1.y, p4.y, globals.height);
        }
    } else if (params.uShape == SHAPE_ARC) {
        if (a.y == b.y) {
            t = remapVisibleChordParameter(tRaw, p1.x, p4.x, globals.width);
        } else if (a.x == b.x) {
            t = remapVisibleChordParameter(tRaw, p1.y, p4.y, globals.height);
        }
    }

    // Match Core's de Casteljau evaluation for stable long links.
    let q1 = mix(p1, p2, t);
    let q2 = mix(p2, p3, t);
    let q3 = mix(p3, p4, t);
    let r1 = mix(q1, q2, t);
    let r2 = mix(q2, q3, t);
    var p = mix(r1, r2, t);
    let tangent = normalize(3.0 * (r2 - r1));
    let normal = vec2<f32>(-tangent.y, tangent.x);

    var size = getScaled_size(i);
    // Avoid artifacts in very thin lines by clamping the size and adjusting
    // opacity accordingly.
    if (size < pixelSize) {
        opacity *= size / pixelSize;
        size = pixelSize;
    }

    // Add AA padding to the stroke width.
    let paddedSize = size + pixelSize;
    var normalDistance = side * paddedSize;

    if (params.uShape == SHAPE_ARC &&
        params.uArcFadingDistance.x > 0.0 &&
        params.uArcFadingDistance.y > 0.0)
    {
        let d = distanceFromLine(p1, p4, p);
        let distanceOpacity = smoothstep(params.uArcFadingDistance.y, params.uArcFadingDistance.x, d);
        opacity *= distanceOpacity;
        // Collapse fully transparent triangles to skip fragment processing.
        if (distanceOpacity <= 0.0) {
            normalDistance = 0.0;
        }
    }

    // Extrude along the normal.
    p = p + normal * normalDistance;

    let clip = vec2<f32>(
        (p.x / globals.width) * 2.0 - 1.0,
        1.0 - (p.y / globals.height) * 2.0
    );

    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = placementClipBounds(i);
#endif
    out.pos = vec4<f32>(applyPlacementClip(clip, i), 0.0, 1.0);
    let color = getScaled_color(i);
    out.color = premultiplyAlpha(vec4<f32>(color.rgb, color.a * opacity));
    out.normalDistance = normalDistance;
    out.size = paddedSize;
    out.pickId = 0u;
#if defined(uniqueId_DEFINED)
    out.pickId = getScaled_uniqueId(i) + 1u;
#endif
    return out;
}

fn shade(in: VSOut) -> vec4<f32> {
    // Linear AA ramp based on distance from the line center.
    let distance = abs(in.normalDistance);
    let alpha = clamp(((in.size * 0.5 - distance) * globals.dpr), 0.0, 1.0);
    return in.color * alpha;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
#if defined(PLACEMENT_ENABLED)
    if (!isInsidePlacementClip(in.pos, in.placementClip)) { discard; }
#endif
    return shade(in);
}
`;

export default class LinkProgram extends BaseProgram {
    get propertySlotDefinitions() {
        return {
            arcFadingDistance: {
                uniform: "uArcFadingDistance",
                default: [0, 0],
            },
            arcHeightFactor: { uniform: "uArcHeightFactor", default: 1 },
            minArcHeight: { uniform: "uMinArcHeight", default: 1.5 },
            linkShape: {
                uniform: "uShape",
                default: "arc",
                encode: encodeLinkShape,
            },
            orient: {
                uniform: "uOrient",
                default: "vertical",
                encode: encodeOrient,
            },
            clampApex: {
                uniform: "uClampApex",
                default: false,
                encode: (/** @type {boolean} */ value) => (value ? 1 : 0),
            },
            maxChordLength: { uniform: "uMaxChordLength", default: 50000 },
            segments: {
                uniform: "uSegmentBreaks",
                default: 101,
                encode: (/** @type {number} */ value) => {
                    const segments = Math.round(Number(value));
                    this._segmentCount = segments;
                    return segments;
                },
            },
        };
    }

    _initializeExtraUniforms() {
        initializePropertySlots(this, this.propertySlotDefinitions);
    }

    /**
     * @param {string} name
     * @param {number | number[]} value
     */
    _setExtraUniformValue(name, value) {
        super._setExtraUniformValue(name, value);
        if (name == "uSegmentBreaks") {
            this._segmentCount = Math.round(Number(value));
        }
    }

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

    /**
     * @returns {GPUPrimitiveTopology}
     */
    get primitiveTopology() {
        return "triangle-strip";
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

    /**
     * @param {GPURenderPassEncoder} pass
     * @param {import("../../index.d.ts").ProgramDrawOptions} options
     */
    draw(pass, options) {
        const segmentCount = Math.max(1, this._segmentCount ?? 1);
        const vertexCount = (segmentCount + 1) * 2;
        pass.setPipeline(this._getPipeline(options.sampleCount));
        pass.setBindGroup(1, this._bindGroup);
        pass.draw(vertexCount, options.instanceCount, 0, options.firstInstance);
    }

    /**
     * @param {GPURenderPassEncoder} pass
     * @param {import("../../index.d.ts").ProgramDrawOptions} options
     */
    drawPick(pass, options) {
        const segmentCount = Math.max(1, this._segmentCount ?? 1);
        const vertexCount = (segmentCount + 1) * 2;
        pass.setPipeline(this._getPickPipeline());
        pass.setBindGroup(1, this._bindGroup);
        pass.draw(vertexCount, options.instanceCount, 0, options.firstInstance);
    }
}
