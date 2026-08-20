import { color as parseColor } from "d3-color";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { ruleMark } from "@genome-spy/webgpu-renderer/marks/rule";
import { textMark } from "@genome-spy/webgpu-renderer/marks/text";
import { identityScale } from "@genome-spy/webgpu-renderer/scales/identity";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";

import { getMarkData } from "../immediate/markData.js";

const SHAPE_CODES = new Map(
    [
        "circle",
        "square",
        "cross",
        "diamond",
        "triangle-up",
        "triangle-right",
        "triangle-down",
        "triangle-left",
        "tick-up",
        "tick-right",
        "tick-down",
        "tick-left",
    ].map((shape, index) => [shape, index])
);

const ALIGN_CODES = new Map([
    ["left", 0],
    ["center", 1],
    ["right", 2],
]);

const BASELINE_CODES = new Map([
    ["alphabetic", 0],
    ["baseline", 0],
    ["middle", 1],
    ["top", 2],
    ["bottom", 3],
]);

const STROKE_CAP_CODES = new Map([
    ["butt", 0],
    ["square", 1],
    ["round", 2],
]);

/**
 * Converts one Core mark occurrence into the low-level configuration used by
 * the WebGPU PoC. The adapter intentionally supports only `first.json`.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @returns {{definition: import("@genome-spy/webgpu-renderer").MarkDefinition<any>, config: object} | undefined}
 */
export function createWebGpuMarkConfig(mark, options, coords) {
    if (options.sampleFacetRenderingOptions || mark.encoders.facetIndex) {
        throw unsupported(mark, "Faceted rendering is not supported.");
    }

    const data = getMarkData(mark, options);
    if (data.length == 0) {
        return undefined;
    }

    const markType = mark.getType();
    if (markType == "point") {
        return {
            definition: pointMark,
            config: createPointConfig(mark, data, coords),
        };
    } else if (markType == "rule" || markType == "tick") {
        return {
            definition: ruleMark,
            config: createRuleConfig(mark, data, coords),
        };
    } else if (markType == "text") {
        return {
            definition: textMark,
            config: createTextConfig(mark, data, coords),
        };
    }

    throw unsupported(mark, `Mark type "${markType}" is not supported.`);
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @returns {object}
 */
function createPointConfig(mark, data, coords) {
    return {
        count: data.length,
        channels: {
            x: createPositionChannel(mark, "x", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            size: createNumericChannel(mark, "size", data),
            shape: createEnumChannel(mark, "shape", data, SHAPE_CODES),
            strokeWidth: createNumericChannel(mark, "strokeWidth", data),
            dx: createCombinedOffsetChannel(mark, "x", data),
            dy: createCombinedOffsetChannel(mark, "y", data),
            fill: createColorChannel(mark, "fill", data),
            stroke: createColorChannel(mark, "stroke", data),
            fillOpacity: createNumericChannel(mark, "fillOpacity", data),
            strokeOpacity: createNumericChannel(mark, "strokeOpacity", data),
            angle: createNumericChannel(mark, "angle", data),
            gradientStrength: {
                value: readNumericProperty(mark, "fillGradientStrength"),
            },
            inwardStroke: {
                value: readProperty(mark, "inwardStroke") ? 1 : 0,
                type: "u32",
            },
        },
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @returns {object}
 */
function createRuleConfig(mark, data, coords) {
    if (readProperty(mark, "strokeDash") != null) {
        throw unsupported(mark, "Dashed rules are not supported.");
    }

    return {
        count: data.length,
        channels: {
            x: createPositionChannel(
                mark,
                "x",
                data,
                coords,
                readConstantOffset(mark, "xOffset", data)
            ),
            x2: createPositionChannel(
                mark,
                "x2",
                data,
                coords,
                readConstantOffset(mark, "x2Offset", data)
            ),
            y: createPositionChannel(
                mark,
                "y",
                data,
                coords,
                readConstantOffset(mark, "yOffset", data)
            ),
            y2: createPositionChannel(
                mark,
                "y2",
                data,
                coords,
                readConstantOffset(mark, "y2Offset", data)
            ),
            size: createNumericChannel(mark, "size", data),
            color: createColorChannel(mark, "color", data),
            opacity: createNumericChannel(mark, "opacity", data),
            minLength: { value: readNumericProperty(mark, "minLength") },
            strokeCap: {
                value: mapProperty(mark, "strokeCap", STROKE_CAP_CODES),
                type: "u32",
            },
            strokeDashOffset: {
                value: readNumericProperty(mark, "strokeDashOffset"),
            },
        },
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @returns {object}
 */
function createTextConfig(mark, data, coords) {
    const size = readConstantEncoder(mark, "size", data);
    return {
        count: data.length,
        channels: {
            x: createPositionChannel(mark, "x", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            text: createTextChannel(mark, data),
            size: { value: size },
            angle: createNumericChannel(mark, "angle", data),
            dx: createCombinedOffsetChannel(mark, "x", data),
            dy: createCombinedOffsetChannel(mark, "y", data),
            align: {
                value: mapProperty(mark, "align", ALIGN_CODES),
                type: "u32",
            },
            baseline: {
                value: mapProperty(mark, "baseline", BASELINE_CODES),
                type: "u32",
            },
            fill: createColorChannel(mark, "color", data),
            opacity: createNumericChannel(mark, "opacity", data),
        },
        font: resolveFont(mark),
        fontStyle: readProperty(mark, "fontStyle"),
        fontWeight: readProperty(mark, "fontWeight"),
        fontSize: size,
        paddingX: readNumericProperty(mark, "paddingX"),
        paddingY: readNumericProperty(mark, "paddingY"),
        flushX: !!readProperty(mark, "flushX"),
        flushY: !!readProperty(mark, "flushY"),
        squeeze: !!readProperty(mark, "squeeze"),
    };
}

/**
 * Core's generic sans-serif default is intentionally mapped to the renderer's
 * embedded Lato atlas. Font registration is deferred beyond the PoC.
 *
 * @param {import("../../marks/mark.js").default} mark
 */
function resolveFont(mark) {
    const font = readProperty(mark, "font");
    if (font == null || font == "sans-serif" || font == "Lato") {
        return "Lato";
    }
    throw unsupported(mark, `Font "${String(font)}" is not supported.`);
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {"x" | "x2" | "y" | "y2"} channel
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} [offset]
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createPositionChannel(mark, channel, data, coords, offset = 0) {
    const encoder = requireEncoder(mark, channel);
    assertUnconditional(mark, channel, encoder);
    const range = getAbsoluteRange(channel, coords, offset);
    if (encoder.constant) {
        const unitPosition = Number(encoder(data[0]));
        if (!Number.isFinite(unitPosition)) {
            throw unsupported(mark, `Channel "${channel}" is not finite.`);
        }
        return {
            value: range[0] + unitPosition * (range[1] - range[0]),
            scale: identityScale(),
        };
    }

    const accessor = encoder.branches[0].accessor;
    const values = toFloat32Array(mark, channel, data, accessor);
    return {
        data: values,
        type: "f32",
        scale: createPositionScale(mark, channel, encoder.scale, range),
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createNumericChannel(mark, channel, data) {
    const encoder = requireEncoder(mark, channel);
    assertUnconditional(mark, channel, encoder);
    if (encoder.constant) {
        return { value: Number(encoder(data[0])) };
    }

    const accessor = encoder.branches[0].accessor;
    const config = {
        data: toFloat32Array(mark, channel, data, accessor),
        type: /** @type {const} */ ("f32"),
    };
    const scale = createNonPositionalScale(mark, channel, encoder.scale);
    return scale ? { ...config, scale } : config;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {Map<string, number>} values
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createEnumChannel(mark, channel, data, values) {
    const encoder = requireEncoder(mark, channel);
    assertUnconditional(mark, channel, encoder);
    if (!encoder.constant) {
        throw unsupported(mark, `Data-driven "${channel}" is not supported.`);
    }
    const value = values.get(String(encoder(data[0])));
    if (value === undefined) {
        throw unsupported(
            mark,
            `Unsupported ${channel}: ${String(encoder(data[0]))}`
        );
    }
    return { value, type: "u32" };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createColorChannel(mark, channel, data) {
    const encoder = requireEncoder(mark, channel);
    assertUnconditional(mark, channel, encoder);
    if (!encoder.constant) {
        throw unsupported(mark, `Data-driven "${channel}" is not supported.`);
    }
    return { value: toRgba(mark, encoder(data[0])) };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").TextStringChannelConfigInput}
 */
function createTextChannel(mark, data) {
    const encoder = requireEncoder(mark, "text");
    assertUnconditional(mark, "text", encoder);
    /** @param {object} datum */
    const stringify = (datum) => {
        const value = encoder(datum);
        return value == null ? "" : String(value);
    };
    return encoder.constant
        ? { value: stringify(data[0]) }
        : { data: data.map(stringify) };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {"x" | "y"} axis
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createCombinedOffsetChannel(mark, axis, data) {
    const offset = requireEncoder(mark, axis + "Offset");
    assertUnconditional(mark, axis + "Offset", offset);

    const legacyChannel = axis == "x" ? "dx" : "dy";
    const legacy = mark.encoders[legacyChannel];
    if (legacy) {
        assertUnconditional(mark, legacyChannel, legacy);
    }
    const propertyValue = legacy ? 0 : readNumericProperty(mark, legacyChannel);
    /** @param {object} datum */
    const read = (datum) =>
        Number(offset(datum)) +
        (legacy ? Number(legacy(datum)) : propertyValue);

    if (offset.constant && (!legacy || legacy.constant)) {
        return { value: read(data[0]) };
    }
    return {
        data: Float32Array.from(data, read),
        type: "f32",
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 */
function readConstantOffset(mark, channel, data) {
    const encoder = requireEncoder(mark, channel);
    assertUnconditional(mark, channel, encoder);
    if (!encoder.constant) {
        throw unsupported(mark, `Data-driven "${channel}" is not supported.`);
    }
    return Number(encoder(data[0]));
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 */
function readConstantEncoder(mark, channel, data) {
    const encoder = requireEncoder(mark, channel);
    assertUnconditional(mark, channel, encoder);
    if (!encoder.constant) {
        throw unsupported(mark, `Data-driven "${channel}" is not supported.`);
    }
    return Number(encoder(data[0]));
}

/**
 * Temporary unit-to-logical-pixel range shim. Delete this function when Core
 * positional encoders use pixel ranges.
 *
 * @param {string} channel
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} offset
 * @returns {[number, number]}
 */
function getAbsoluteRange(channel, coords, offset) {
    return channel[0] == "x"
        ? [coords.x + offset, coords.x2 + offset]
        : [coords.y2 + offset, coords.y + offset];
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").VegaScale | undefined} scale
 * @param {[number, number]} range
 * @returns {import("@genome-spy/webgpu-renderer").ConfiguredScale<"linear">}
 */
function createPositionScale(mark, channel, scale, range) {
    if (!scale || scale.type == "null") {
        return linearScale({ domain: [0, 1], range });
    }
    if (scale.type != "linear") {
        throw unsupported(
            mark,
            `Scale type "${scale.type}" on channel "${channel}" is not supported.`
        );
    }
    const configurableScale = /** @type {any} */ (scale);
    return linearScale({
        domain: scale.domain().map(Number),
        range,
        clamp:
            typeof configurableScale.clamp == "function"
                ? configurableScale.clamp()
                : false,
    });
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").VegaScale | undefined} scale
 * @returns {import("@genome-spy/webgpu-renderer").ConfiguredScale<"identity" | "linear"> | undefined}
 */
function createNonPositionalScale(mark, channel, scale) {
    if (!scale || scale.type == "null") {
        return undefined;
    }
    if (scale.type == "identity") {
        return identityScale();
    }
    if (scale.type != "linear") {
        throw unsupported(
            mark,
            `Scale type "${scale.type}" on channel "${channel}" is not supported.`
        );
    }
    const configurableScale = /** @type {any} */ (scale);
    return linearScale({
        domain: scale.domain().map(Number),
        range: scale.range().map(Number),
        clamp:
            typeof configurableScale.clamp == "function"
                ? configurableScale.clamp()
                : false,
    });
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @returns {import("../../types/encoder.js").Encoder}
 */
function requireEncoder(mark, channel) {
    const encoder =
        /** @type {Record<string, import("../../types/encoder.js").Encoder | undefined>} */ (
            mark.encoders
        )[channel];
    if (!encoder) {
        throw unsupported(mark, `Missing encoder for channel "${channel}".`);
    }
    return encoder;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").Encoder} encoder
 */
function assertUnconditional(mark, channel, encoder) {
    if (encoder.branches.length != 1) {
        throw unsupported(
            mark,
            `Conditional channel "${channel}" is not supported.`
        );
    }
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Accessor} accessor
 */
function toFloat32Array(mark, channel, data, accessor) {
    return Float32Array.from(data, (datum) => {
        const value = Number(accessor(datum));
        if (!Number.isFinite(value)) {
            throw unsupported(mark, `Channel "${channel}" is not finite.`);
        }
        return value;
    });
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 */
function readNumericProperty(mark, property) {
    const value = readProperty(mark, property);
    if (typeof value != "number") {
        throw unsupported(
            mark,
            `Property "${property}" must be a number in the WebGPU proof of concept.`
        );
    }
    return value;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 * @param {Map<string, number>} values
 */
function mapProperty(mark, property, values) {
    const raw = String(readProperty(mark, property));
    const value = values.get(raw);
    if (value === undefined) {
        throw unsupported(mark, `Unsupported ${property}: ${raw}`);
    }
    return value;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 */
function readProperty(mark, property) {
    return /** @type {Record<string, any>} */ (mark.properties)[property];
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {unknown} value
 * @returns {[number, number, number, number]}
 */
function toRgba(mark, value) {
    if (value == null) {
        return [0, 0, 0, 0];
    }
    const parsed = parseColor(String(value));
    if (!parsed) {
        throw unsupported(mark, `Invalid color: ${String(value)}`);
    }
    const rgb = parsed.rgb();
    return [rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.opacity];
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} message
 */
function unsupported(mark, message) {
    const error = new Error(
        `${message} Mark: ${mark.getType()}. View: ${mark.unitView.getPathString()}`
    );
    /** @type {any} */ (error).view = mark.unitView;
    return error;
}
