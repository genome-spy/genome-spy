import BaseProgram from "./internal/baseProgram.js";
import { buildChannelMaps } from "../utils/channelSpecUtils.js";
import DASH_WGSL from "../../wgsl/dash.wgsl.js";
import { buildDashAtlas } from "../../utils/dashAtlas.js";
import { createTextureFromData } from "../../utils/webgpuTextureUtils.js";

/**
 * @typedef {import("../../index.js").ChannelConfigInput} ChannelConfigInput
 */

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const RULE_CHANNEL_SPECS = {
    uniqueId: { type: "u32", components: 1, optional: true },
    x: { type: "f32", components: 1 },
    x2: { type: "f32", components: 1 },
    y: { type: "f32", components: 1 },
    y2: { type: "f32", components: 1 },
    size: { type: "f32", components: 1, default: 1.0 },
    color: { type: "f32", components: 4, default: [0.0, 0.0, 0.0, 1.0] },
    opacity: { type: "f32", components: 1, default: 1.0 },
    minLength: { type: "f32", components: 1, default: 0.0 },
    strokeCap: { type: "u32", components: 1, default: 0 },
    strokeDash: { type: "u32", components: 1, default: 0 },
    strokeDashOffset: { components: 1, default: 0.0 },
};

const {
    channels: CHANNELS,
    defaults: DEFAULTS,
    defaultConfigs: DEFAULT_CHANNEL_CONFIGS,
    optionalChannels: OPTIONAL_CHANNELS,
} = buildChannelMaps(RULE_CHANNEL_SPECS);

const RULE_SHADER_BODY = /* wgsl */ `
${DASH_WGSL}

// Line caps and dashes are supported.
// Keep rule math in pixel coordinates to avoid unit-range indirection.

// Line caps
const BUTT: u32 = 0u;
const SQUARE: u32 = 1u;
const ROUND: u32 = 2u;

struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normalDistance: f32,
    @location(2) halfWidth: f32,
    @location(3) opacity: f32,
    @location(4) posInPixels: vec2<f32>,
    @location(5) @interpolate(flat) strokeCap: u32,
    @location(6) @interpolate(flat) dashIndex: u32,
    @location(7) @interpolate(flat) dashOffset: f32,
    @location(8) @interpolate(flat) pickId: u32,
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

    let local = quad[v];

    let pixelSize = 1.0 / globals.dpr;

    // Stroke width in pixels.
    var width = getScaled_size(i);
    var opacity = getScaled_opacity(i);

    // Avoid artifacts in very thin lines by clamping the size and adjusting opacity respectively.
    if (width < pixelSize) {
        opacity *= width / pixelSize;
        width = pixelSize;
    }

    // Start/end points in pixel coordinates.
    let a = vec2<f32>(getScaled_x(i), getScaled_y(i));
    let b = vec2<f32>(getScaled_x2(i), getScaled_y2(i));

    // Avoid artifacts in degenerate rules by falling back to a unit tangent.
    var tangent = b - a;
    let len = length(tangent);
    if (len == 0.0) {
        tangent = vec2<f32>(1.0, 0.0);
    }
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
        if (len > 0.0) {
            relativeDiff = diff / len;
            offset = relativeDiff * (local.x - 0.5);
        }
    }

    // Add an extra pixel to stroke width to accommodate edge antialiasing.
    let aaPadding = pixelSize;
    let halfWidth = 0.5 * (width + aaPadding);
    let side = local.y - 0.5;

    // Apply caps and minimum length by spreading the vertices along the tangent.
    var position = a + tangent * (local.x + offset);

    // Extrude the quad along the normal direction.
    position = position + normal * side * (width + aaPadding);
    let clip = vec2<f32>(
        (position.x / globals.width) * 2.0 - 1.0,
        1.0 - (position.y / globals.height) * 2.0
    );

    var out: VSOut;
    out.pos = vec4<f32>(clip, 0.0, 1.0);
    out.color = getScaled_color(i);
    out.normalDistance = side * (width + aaPadding);
    out.halfWidth = halfWidth;
    out.opacity = opacity;
    // Distances from the line endings (pixels). Used for round caps.
    out.posInPixels = vec2<f32>(local.x, 1.0 - local.x) * (1.0 + relativeDiff) * len -
        vec2<f32>(select(0.0, width * 0.5, strokeCap != BUTT));
    // TODO: Precision issues can appear at extreme zoom levels.
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
    let pixelSize = 1.0 / globals.dpr;
    let width = max(0.0, in.halfWidth * 2.0 - pixelSize);
    let dash = dashMask(
        dashAtlas,
        in.dashIndex,
        in.posInPixels.x,
        width,
        in.dashOffset
    );
    let alpha = clamp(((in.halfWidth - distance) * globals.dpr) + 0.5, 0.0, 1.0);
    let color = vec4<f32>(in.color.rgb, in.color.a * in.opacity);
    return color * alpha * dash;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return shade(in);
}
`;

export default class RuleProgram extends BaseProgram {
    get channelOrder() {
        return CHANNELS;
    }

    get optionalChannels() {
        return OPTIONAL_CHANNELS;
    }

    get channelSpecs() {
        return RULE_CHANNEL_SPECS;
    }

    get defaultChannelConfigs() {
        return DEFAULT_CHANNEL_CONFIGS;
    }

    get defaultValues() {
        return DEFAULTS;
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

    _initializeExtraResources() {
        const patterns = /** @type {number[][] | null | undefined} */ (
            this._markConfig?.dashPatterns ?? null
        );
        const atlas = buildDashAtlas(patterns);
        /** @type {number} */
        this._dashPatternCount = atlas.patternCount;

        const texture = createTextureFromData(this.device, {
            format: "r8uint",
            width: atlas.width,
            height: atlas.height,
            data: atlas.data,
        });
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

    _initializeExtraUniforms() {
        this._setUniformValue("uDashPatternCount", this._dashPatternCount ?? 0);
    }
}
