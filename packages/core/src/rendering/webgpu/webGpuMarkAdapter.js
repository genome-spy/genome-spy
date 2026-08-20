import { color as parseColor } from "d3-color";
import { format as numberFormat } from "d3-format";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { rectMark } from "@genome-spy/webgpu-renderer/marks/rect";
import { ruleMark } from "@genome-spy/webgpu-renderer/marks/rule";
import { textMark } from "@genome-spy/webgpu-renderer/marks/text";
import { bandScale } from "@genome-spy/webgpu-renderer/scales/band";
import { identityScale } from "@genome-spy/webgpu-renderer/scales/identity";
import { indexScale } from "@genome-spy/webgpu-renderer/scales/index";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";
import { thresholdScale } from "@genome-spy/webgpu-renderer/scales/threshold";

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
        "x",
        "+",
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

const HATCH_CODES = new Map(
    [
        "none",
        "diagonal",
        "antiDiagonal",
        "cross",
        "vertical",
        "horizontal",
        "grid",
        "dots",
        "rings",
        "ringsLarge",
    ].map((hatch, index) => [hatch, index])
);

/**
 * Materialized collector batch identity acts as the data revision. Only field
 * accessors are cached because expression accessors may depend on parameters
 * that change without replacing the batch.
 *
 * @type {WeakMap<import("../../marks/mark.js").default, SeriesCache>}
 */
const SERIES_CACHE = new WeakMap();

/**
 * The renderer represents categorical values as u32 identifiers. Keep the
 * identifiers stable for each mark channel so cached columns remain valid when
 * a band-scale domain changes.
 *
 * @type {WeakMap<import("../../marks/mark.js").default, Map<string, Map<import("../../spec/channel.js").Scalar, number>>>}
 */
const CATEGORY_IDS = new WeakMap();

/**
 * Converts one Core mark occurrence into the low-level configuration used by
 * the WebGPU PoC. The adapter intentionally supports only the current
 * point/rect/rule/text integration slice.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} [viewOpacity]
 * @returns {{definition: import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>, config: object} | undefined}
 */
export function createWebGpuMarkConfig(mark, options, coords, viewOpacity = 1) {
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
            config: createPointConfig(mark, data, coords, viewOpacity),
        };
    } else if (markType == "rect") {
        return {
            definition: rectMark,
            config: createRectConfig(mark, data, coords, viewOpacity),
        };
    } else if (markType == "rule" || markType == "tick") {
        return {
            definition: ruleMark,
            config: createRuleConfig(mark, data, coords, viewOpacity),
        };
    } else if (markType == "text") {
        return {
            definition: textMark,
            config: createTextConfig(mark, data, coords, viewOpacity),
        };
    }

    throw unsupported(mark, `Mark type "${markType}" is not supported.`);
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} viewOpacity
 * @returns {object}
 */
function createRectConfig(mark, data, coords, viewOpacity) {
    const cornerRadii = readCornerRadii(mark);
    return {
        count: data.length,
        channels: {
            x: createPositionChannel(mark, "x", data, coords),
            x2: createPositionChannel(mark, "x2", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            y2: createPositionChannel(mark, "y2", data, coords),
            xOffset: createNumericChannel(mark, "xOffset", data),
            x2Offset: createNumericChannel(mark, "x2Offset", data),
            yOffset: createNumericChannel(mark, "yOffset", data),
            y2Offset: createNumericChannel(mark, "y2Offset", data),
            fill: createColorChannel(mark, "fill", data),
            stroke: createColorChannel(mark, "stroke", data),
            fillOpacity: createOpacityChannel(
                mark,
                "fillOpacity",
                data,
                viewOpacity
            ),
            strokeOpacity: createOpacityChannel(
                mark,
                "strokeOpacity",
                data,
                viewOpacity
            ),
            strokeWidth: createNumericChannel(mark, "strokeWidth", data),
            cornerRadiusTopRight: { value: cornerRadii.topRight },
            cornerRadiusBottomRight: { value: cornerRadii.bottomRight },
            cornerRadiusTopLeft: { value: cornerRadii.topLeft },
            cornerRadiusBottomLeft: { value: cornerRadii.bottomLeft },
            minWidth: { value: readNumericProperty(mark, "minWidth") },
            minHeight: { value: readNumericProperty(mark, "minHeight") },
            minOpacity: { value: readNumericProperty(mark, "minOpacity") },
            shadowOffsetX: {
                value: readOptionalNumericProperty(mark, "shadowOffsetX", 0),
            },
            shadowOffsetY: {
                value: readOptionalNumericProperty(mark, "shadowOffsetY", 0),
            },
            shadowBlur: {
                value: readOptionalNumericProperty(mark, "shadowBlur", 0),
            },
            shadowOpacity: {
                value:
                    readOptionalNumericProperty(mark, "shadowOpacity", 0) *
                    viewOpacity,
            },
            shadowColor: {
                value: toRgba(
                    mark,
                    readProperty(mark, "shadowColor") ?? "black"
                ),
            },
            hatchPattern: {
                value: mapProperty(mark, "hatch", HATCH_CODES, "none"),
                type: "u32",
            },
        },
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} viewOpacity
 * @returns {object}
 */
function createPointConfig(mark, data, coords, viewOpacity) {
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
            fillOpacity: createOpacityChannel(
                mark,
                "fillOpacity",
                data,
                viewOpacity
            ),
            strokeOpacity: createOpacityChannel(
                mark,
                "strokeOpacity",
                data,
                viewOpacity
            ),
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
 * @param {number} viewOpacity
 * @returns {object}
 */
function createRuleConfig(mark, data, coords, viewOpacity) {
    const strokeDash = readProperty(mark, "strokeDash");

    return {
        count: data.length,
        channels: {
            x: createPositionChannel(mark, "x", data, coords),
            x2: createPositionChannel(mark, "x2", data, coords),
            y: createPositionChannel(mark, "y", data, coords),
            y2: createPositionChannel(mark, "y2", data, coords),
            xOffset: createNumericChannel(mark, "xOffset", data),
            x2Offset: createNumericChannel(mark, "x2Offset", data),
            yOffset: createNumericChannel(mark, "yOffset", data),
            y2Offset: createNumericChannel(mark, "y2Offset", data),
            size: createNumericChannel(mark, "size", data),
            color: createColorChannel(mark, "color", data),
            opacity: createOpacityChannel(mark, "opacity", data, viewOpacity),
            minLength: { value: readNumericProperty(mark, "minLength") },
            strokeCap: {
                value: mapProperty(mark, "strokeCap", STROKE_CAP_CODES),
                type: "u32",
            },
            strokeDashOffset: {
                value: readNumericProperty(mark, "strokeDashOffset"),
            },
            strokeDash: { value: 0, type: "u32" },
        },
        dashPatterns: strokeDash == null ? null : [strokeDash],
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} viewOpacity
 * @returns {object}
 */
function createTextConfig(mark, data, coords, viewOpacity) {
    const size = readConstantEncoder(mark, "size", data);
    return {
        count: data.length,
        channels: {
            x: createPositionChannel(mark, "x", data, coords),
            ...(mark.encoders.x2
                ? {
                      x2: createPositionChannel(mark, "x2", data, coords),
                  }
                : {}),
            y: createPositionChannel(mark, "y", data, coords),
            ...(mark.encoders.y2
                ? {
                      y2: createPositionChannel(mark, "y2", data, coords),
                  }
                : {}),
            text: createTextChannel(mark, data),
            size: { value: size },
            angle: createNumericChannel(mark, "angle", data),
            dx: createCombinedOffsetChannel(mark, "x", data),
            dy: createCombinedOffsetChannel(mark, "y", data),
            ...(mark.encoders.x2Offset
                ? { x2Offset: createNumericChannel(mark, "x2Offset", data) }
                : {}),
            ...(mark.encoders.y2Offset
                ? { y2Offset: createNumericChannel(mark, "y2Offset", data) }
                : {}),
            align: {
                value: mapProperty(mark, "align", ALIGN_CODES),
                type: "u32",
            },
            baseline: {
                value: mapProperty(mark, "baseline", BASELINE_CODES),
                type: "u32",
            },
            fill: createColorChannel(mark, "color", data),
            opacity: createOpacityChannel(mark, "opacity", data, viewOpacity),
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
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createPositionChannel(mark, channel, data, coords) {
    const encoder = requireEncoder(mark, channel);
    assertUnconditional(mark, channel, encoder);
    const range = getAbsoluteRange(channel, coords);
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
    if (encoder.scale?.type == "band") {
        const { values, domain } = toCategoricalArray(
            mark,
            channel,
            data,
            accessor,
            encoder.scale
        );
        return {
            data: values,
            type: "u32",
            scale: createBandPositionScale(
                encoder.scale,
                range,
                domain,
                /** @type {import("../../spec/channel.js").BandMixins} */ (
                    accessor.channelDef
                ).band ?? 0.5
            ),
        };
    } else if (encoder.scale?.type == "index") {
        return {
            data: toIndexArray(mark, channel, data, accessor),
            type: "u32",
            inputComponents: 2,
            scale: createIndexPositionScale(
                encoder.scale,
                range,
                /** @type {import("../../spec/channel.js").BandMixins} */ (
                    accessor.channelDef
                ).band ?? 0.5
            ),
        };
    }

    const values = toFloat32Array(mark, channel, data, accessor);
    return {
        data: values,
        type: "f32",
        scale: createPositionScale(mark, channel, encoder.scale, range),
    };
}

/**
 * @param {import("../../types/encoder.js").VegaScale} scale
 * @param {[number, number]} range
 * @param {number[]} domain
 * @param {number} band
 */
function createBandPositionScale(scale, range, domain, band) {
    const configurableScale = /** @type {any} */ (scale);
    return bandScale({
        domain,
        range,
        paddingInner: configurableScale.paddingInner(),
        paddingOuter: configurableScale.paddingOuter(),
        align: configurableScale.align(),
        band,
    });
}

/**
 * @param {import("../../types/encoder.js").VegaScale} scale
 * @param {[number, number]} range
 * @param {number} band
 */
function createIndexPositionScale(scale, range, band) {
    const configurableScale = /** @type {any} */ (scale);
    return indexScale({
        domain: scale.domain().map(Number),
        range,
        paddingInner: configurableScale.paddingInner(),
        paddingOuter: configurableScale.paddingOuter(),
        align: configurableScale.align(),
        band,
    });
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
 * Applies view opacity after channel scaling by multiplying numeric scale
 * ranges. Unscaled series are multiplied while materializing the column.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {number} viewOpacity
 * @returns {import("@genome-spy/webgpu-renderer").ChannelConfigInput}
 */
function createOpacityChannel(mark, channel, data, viewOpacity) {
    const encoder = requireEncoder(mark, channel);
    assertUnconditional(mark, channel, encoder);
    if (encoder.constant) {
        return { value: Number(encoder(data[0])) * viewOpacity };
    }

    const accessor = encoder.branches[0].accessor;
    const scale =
        encoder.scale?.type == "identity"
            ? undefined
            : createNonPositionalScale(
                  mark,
                  channel,
                  encoder.scale,
                  viewOpacity
              );
    if (scale) {
        return {
            data: toFloat32Array(mark, channel, data, accessor),
            type: "f32",
            scale,
        };
    }

    return {
        data:
            viewOpacity == 1
                ? toFloat32Array(mark, channel, data, accessor)
                : Float32Array.from(
                      data,
                      (datum) => Number(accessor(datum)) * viewOpacity
                  ),
        type: "f32",
    };
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
    if (encoder.constant) {
        return { value: toRgba(mark, encoder(data[0])) };
    }

    const scale = encoder.scale;
    if (!scale) {
        throw unsupported(mark, `Data-driven "${channel}" is not supported.`);
    }

    const accessor = encoder.branches[0].accessor;
    return {
        data: toFloat32Array(mark, channel, data, accessor),
        type: "f32",
        inputComponents: 1,
        scale: createColorScale(mark, channel, scale),
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {import("../../types/encoder.js").VegaScale} scale
 */
function createColorScale(mark, channel, scale) {
    const configurableScale = /** @type {any} */ (scale);
    if (scale.type == "sequential-linear") {
        return linearScale({
            domain: scale.domain().map(Number),
            range: configurableScale.interpolator(),
            clamp: configurableScale.clamp(),
        });
    } else if (scale.type == "linear") {
        return linearScale({
            domain: scale.domain().map(Number),
            range: scale.range(),
            interpolate: configurableScale.interpolate(),
            clamp: configurableScale.clamp(),
        });
    } else if (scale.type == "threshold") {
        return thresholdScale({
            domain: scale.domain().map(Number),
            range: scale.range(),
        });
    }

    throw unsupported(
        mark,
        `Scale type "${scale.type}" on channel "${channel}" is not supported.`
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {object[]} data
 * @returns {import("@genome-spy/webgpu-renderer").TextStringChannelConfigInput}
 */
function createTextChannel(mark, data) {
    const encoder = requireEncoder(mark, "text");
    assertUnconditional(mark, "text", encoder);
    const channelDef = encoder.channelDef;
    const formatValue =
        "format" in channelDef
            ? numberFormat(channelDef.format)
            : (/** @type {any} */ d) => d;
    /** @param {object} datum */
    const stringify = (datum) => {
        const value = formatValue(encoder(datum));
        return value == null ? "" : String(value);
    };
    return encoder.constant
        ? { value: stringify(data[0]) }
        : {
              data: getCachedSeries(
                  mark,
                  "text",
                  data,
                  encoder.branches[0].accessor,
                  () => data.map(stringify)
              ),
          };
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
 * @returns {[number, number]}
 */
function getAbsoluteRange(channel, coords) {
    return channel[0] == "x" ? [coords.x, coords.x2] : [coords.y2, coords.y];
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
 * @param {number} [rangeMultiplier]
 * @returns {import("@genome-spy/webgpu-renderer").ConfiguredScale<"identity" | "linear"> | undefined}
 */
function createNonPositionalScale(mark, channel, scale, rangeMultiplier = 1) {
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
        range: scale.range().map((value) => Number(value) * rangeMultiplier),
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
    return getCachedSeries(mark, channel, data, accessor, () =>
        Float32Array.from(data, (datum) => {
            const value = Number(accessor(datum));
            if (!Number.isFinite(value)) {
                throw unsupported(mark, `Channel "${channel}" is not finite.`);
            }
            return value;
        })
    );
}

/**
 * The renderer accepts Float64 index data as a request to pack each safe
 * integer into two u32 components. Always use that path so scale-domain updates
 * cannot change the series representation.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Accessor} accessor
 */
function toIndexArray(mark, channel, data, accessor) {
    return getCachedSeries(mark, channel, data, accessor, () =>
        Float64Array.from(data, (datum) => {
            const value = Number(accessor(datum));
            if (!Number.isSafeInteger(value) || value < 0) {
                throw unsupported(
                    mark,
                    `Channel "${channel}" must contain non-negative safe integers.`
                );
            }
            return value;
        })
    );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Accessor} accessor
 * @param {import("../../types/encoder.js").VegaScale} scale
 */
function toCategoricalArray(mark, channel, data, accessor, scale) {
    let markCategories = CATEGORY_IDS.get(mark);
    if (!markCategories) {
        markCategories = new Map();
        CATEGORY_IDS.set(mark, markCategories);
    }

    let categoryIds = markCategories.get(channel);
    if (!categoryIds) {
        categoryIds = new Map();
        markCategories.set(channel, categoryIds);
    }

    /** @param {import("../../spec/channel.js").Scalar} value */
    const intern = (value) => {
        let id = categoryIds.get(value);
        if (id === undefined) {
            id = categoryIds.size;
            categoryIds.set(value, id);
        }
        return id;
    };

    const domain = scale.domain().map(intern);
    const values = getCachedSeries(mark, channel, data, accessor, () =>
        Uint32Array.from(data, (datum) => intern(accessor(datum)))
    );
    return { values, domain };
}

/**
 * @template {import("@genome-spy/webgpu-renderer").SeriesData} T
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} channel
 * @param {object[]} data
 * @param {import("../../types/encoder.js").Accessor} accessor
 * @param {() => T} create
 * @returns {T}
 */
function getCachedSeries(mark, channel, data, accessor, create) {
    if (!("field" in accessor.channelDef)) {
        return create();
    }

    let cache = SERIES_CACHE.get(mark);
    if (!cache || cache.data !== data) {
        cache = { data, channels: new Map() };
        SERIES_CACHE.set(mark, cache);
    }

    const cached = cache.channels.get(channel);
    if (cached?.accessor === accessor) {
        return /** @type {T} */ (cached.series);
    }

    const series = create();
    cache.channels.set(channel, { accessor, series });
    return series;
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
 * @param {number} fallback
 */
function readOptionalNumericProperty(mark, property, fallback) {
    const value = readProperty(mark, property) ?? fallback;
    if (typeof value != "number") {
        throw unsupported(
            mark,
            `Property "${property}" must be a number in the WebGPU proof of concept.`
        );
    }
    return value;
}

/** @param {import("../../marks/mark.js").default} mark */
function readCornerRadii(mark) {
    const radius = readNumericProperty(mark, "cornerRadius");
    return {
        topRight: readOptionalNumericProperty(
            mark,
            "cornerRadiusTopRight",
            radius
        ),
        bottomRight: readOptionalNumericProperty(
            mark,
            "cornerRadiusBottomRight",
            radius
        ),
        topLeft: readOptionalNumericProperty(
            mark,
            "cornerRadiusTopLeft",
            radius
        ),
        bottomLeft: readOptionalNumericProperty(
            mark,
            "cornerRadiusBottomLeft",
            radius
        ),
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 * @param {Map<string, number>} values
 * @param {string} [fallback]
 */
function mapProperty(mark, property, values, fallback) {
    const raw = String(readProperty(mark, property) ?? fallback);
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

/**
 * @typedef {object} SeriesCache
 * @prop {object[]} data
 * @prop {Map<string, {accessor: import("../../types/encoder.js").Accessor, series: import("@genome-spy/webgpu-renderer").SeriesData}>} channels
 */
