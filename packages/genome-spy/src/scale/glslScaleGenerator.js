import { isContinuous, isDiscrete, isInterpolating } from "vega-scale";
import { fp64ify } from "../gl/includes/fp64-utils";
import { isNumber, isString } from "vega-util";
import { color as d3color } from "d3-color";

import { isColorChannel, primaryChannel } from "../encoder/encoder";
import { peek } from "../utils/arrayUtils";

export const ATTRIBUTE_PREFIX = "attr_";
export const DOMAIN_PREFIX = "uDomain_";
export const RANGE_PREFIX = "range_";
export const SCALE_FUNCTION_PREFIX = "scale_";
export const SCALED_FUNCTION_PREFIX = "getScaled_";

// https://stackoverflow.com/a/47543127
const FLT_MAX = 3.402823466e38;

/**
 * Splits a vega-scale type (e.g., linear, sequential-linear) to components.
 *
 * @param {string} type
 */
function splitScaleType(type) {
    const match = type.match(/^(?:(\w+)-)?(\w+)$/);
    if (!match) {
        throw new Error("Not a scale type: " + type);
    }
    return {
        family: match[1] || "continuous",
        transform: match[2]
    };
}

/**
 *
 * @param {string} channel
 * @param {number | number[] | string} value
 */
export function generateValueGlsl(channel, value) {
    /** @type {VectorizedValue} */
    let vec;
    if (isString(value)) {
        if (isColorChannel(channel)) {
            vec = vectorizeCssColor(value);
        } else {
            throw new Error(
                `String values are not supported on "${channel}" channel!`
            );
        }
        // TODO: Symbols
    } else {
        vec = vectorize(value);
    }

    // These could also be passed as uniforms because GPU drivers often handle
    // uniforms as constants and recompile the shader to eliminate dead code etc.
    let glsl = `
#define ${channel}_DEFINED
${vec.type} ${SCALED_FUNCTION_PREFIX}${channel}() {
    // Constant value
    return ${vec};
}`;
    return glsl;
}

/**
 *
 * @param {string} channel
 * @param {any} scale
 * @param {import("../spec/view").EncodingConfig} encoding
 */
// eslint-disable-next-line complexity
export function generateScaleGlsl(channel, scale, encoding) {
    const primary = primaryChannel(channel);
    const attributeName = ATTRIBUTE_PREFIX + channel;
    const domainName = DOMAIN_PREFIX + primary;
    const rangeName = RANGE_PREFIX + primary;

    const fp64 = scale.fp64;
    const fp64Suffix = fp64 ? "Fp64" : "";
    const attributeType = fp64 ? "vec2" : "float";

    const { transform } = splitScaleType(scale.type);

    let functionCall;
    switch (transform) {
        case "index":
        case "locus":
            functionCall = `scaleBand${fp64Suffix}(value, ${domainName}, ${rangeName}, 0.0, 0.0, ${toDecimal(
                encoding.band ?? 0.5
            )})`;
            break;

        case "linear":
            functionCall = `scaleLinear${fp64Suffix}(value, ${domainName}, ${rangeName})`;
            break;

        case "point":
            // TODO: implement real scalePoint as it is calculated slightly differently
            functionCall = `scaleBand(value, ${domainName}, ${rangeName}, 0.5, 0.0, 0.5)`;
            break;

        case "band":
            functionCall = `scaleBand(value, ${domainName}, ${rangeName}, ${toDecimal(
                scale.paddingInner()
            )}, ${toDecimal(scale.paddingOuter())}, ${toDecimal(
                encoding.band ?? 0.5
            )})`;
            break;

        case "ordinal":
            functionCall = `scaleIdentity(value)`;
            break;

        case "identity":
            functionCall = `scaleIdentity${fp64Suffix}(value)`;
            break;

        default:
            // TODO: Implement log, sqrt, etc...
            throw new Error(
                `Unsupported scale type: ${
                    scale.type
                }! ${channel}: ${JSON.stringify(encoding)}`
            );
    }

    const domainDef =
        (isContinuous(scale.type) || isDiscrete(scale.type)) &&
        channel == primary
            ? `uniform ${fp64 ? "vec4" : "vec2"} ${domainName};`
            : "";

    // N.B. Interpolating scales require unit range
    const range = isInterpolating(scale.type)
        ? [0, 1]
        : scale.range
        ? scale.range()
        : undefined;

    /** @type {string} */
    let rangeDef;
    if (isContinuous(scale.type) && range && channel == primary) {
        const vectorizedRange = range ? vectorize(range) : undefined;

        // Range needs no runtime adjustment. Thus, pass it as a constant that the
        // GLSL compiler can optimize away in the case of unit ranges.
        rangeDef = `const ${vectorizedRange.type} ${rangeName} = ${vectorizedRange};`;
    }

    /** @type {number} */
    let datum;
    if ("datum" in encoding) {
        if (isNumber(encoding.datum)) {
            datum = encoding.datum;
        } else {
            throw new Error(
                `Only quantitative datums are currently supported in the encoding definition: ${JSON.stringify(
                    encoding
                )}`
            );
        }
    }

    const returnType = isColorChannel(channel) ? "vec3" : "float";

    /** @type {string} */
    let interpolate;
    /** @type {string} */
    let interpolatorTexture;

    if (isColorChannel(channel)) {
        const textureUniformName = `uSchemeTexture_${channel}`;
        interpolatorTexture = `uniform sampler2D ${textureUniformName};`;
        if (isInterpolating(scale.type)) {
            interpolate = `getInterpolatedColor(${textureUniformName}, transformed)`;
        } else if (transform == "ordinal") {
            interpolate = `getDiscreteColor(${textureUniformName}, int(transformed))`;
        } else {
            throw new Error("Problem with color scale!");
        }
    }

    return `
#define ${channel}_DEFINED
${fp64 ? `#define ${channel}_FP64` : ""}

${interpolatorTexture ?? ""}
${domainDef}
${rangeDef ?? ""}
in highp ${attributeType} ${attributeName};

// Channel's scale function
${returnType} ${SCALE_FUNCTION_PREFIX}${channel}(${attributeType} value) {
    float transformed = ${functionCall};
    ${
        scale.clamp && scale.clamp()
            ? `transformed = clamp(transformed, ${[range[0], peek(range)]
                  .map(toDecimal)
                  .join(", ")});`
            : ""
    }
    return ${interpolate ?? "transformed"};
}

// Getter for the scaled value
${returnType} ${SCALED_FUNCTION_PREFIX}${channel}() {
    return ${SCALE_FUNCTION_PREFIX}${channel}(${
        datum !== undefined
            ? vectorize(fp64 ? fp64ify(datum) : datum)
            : attributeName
    });
}`;
}

/**
 * Adds a trailing decimal zero so that GLSL is happy.
 *
 * @param {number} number
 * @returns {string}
 */
function toDecimal(number) {
    if (number == Infinity) {
        return "" + FLT_MAX;
    } else if (number == -Infinity) {
        return "" + -FLT_MAX;
    } else {
        let str = `${number}`;
        if (/^\d+$/.test(str)) {
            str += ".0";
        }
        return str;
    }
}

/**
 * Turns a number or number array to float or vec[234] string.
 *
 * @param {number | number[]} value
 * @returns {VectorizedValue}
 *
 * @typedef {string & { type: string, numComponents: number }} VectorizedValue
 */
function vectorize(value) {
    if (typeof value == "number") {
        value = [value];
    }
    const numComponents = value.length;
    if (numComponents < 1 || numComponents > 4) {
        throw new Error("Invalid number of components: " + numComponents);
    }

    let type;
    let str;

    if (numComponents > 1) {
        type = `vec${numComponents}`;
        str = `${type}(${value.map(toDecimal).join(", ")})`;
    } else {
        type = "float";
        str = toDecimal(value[0]);
    }

    return Object.assign(str, { type, numComponents });
}

/**
 * @param {string} color
 */
function vectorizeCssColor(color) {
    const rgb = d3color(color).rgb();
    return vectorize([rgb.r, rgb.g, rgb.b].map(x => x / 255));
}
