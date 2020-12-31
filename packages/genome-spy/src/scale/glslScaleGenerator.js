import { isContinuous, isDiscrete, isInterpolating } from "vega-scale";
import { fp64ify } from "../gl/includes/fp64-utils";
import { isArray, isNumber, isString } from "vega-util";
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
 * @param {import("../spec/view").ChannelDef} encoding
 */
// eslint-disable-next-line complexity
export function generateScaleGlsl(channel, scale, encoding) {
    const primary = primaryChannel(channel);
    const attributeName = ATTRIBUTE_PREFIX + channel;
    const domainName = DOMAIN_PREFIX + primary;
    const rangeName = RANGE_PREFIX + primary;

    const fp64 = scale.fp64;
    const attributeType = fp64 ? "vec2" : "float";

    /** @type {string[]} The generated shader (concatenated at the end) */
    const glsl = [];

    // For debugging
    glsl.push("");
    glsl.push("/".repeat(70));
    glsl.push(`// Channel: ${channel}`);
    glsl.push("");

    glsl.push(`#define ${channel}_DEFINED`);
    if (fp64) {
        glsl.push(`#define ${channel}_FP64`);
    }

    const { transform } = splitScaleType(scale.type);

    /**
     * @param {string} name
     * @param {...any} args
     */
    const makeScaleCall = (name, ...args) =>
        // eslint-disable-next-line no-useless-call
        makeFunctionCall.apply(null, [
            name + (fp64 ? "Fp64" : ""),
            "value",
            ...args
        ]);

    let functionCall;
    switch (transform) {
        case "index":
        case "locus":
            functionCall = makeScaleCall(
                "scaleBand",
                domainName,
                rangeName,
                0,
                0,
                encoding.band ?? 0.5
            );
            break;

        case "linear":
            functionCall = makeScaleCall("scaleLinear", domainName, rangeName);
            break;

        case "point":
            // TODO: implement real scalePoint as it is calculated slightly differently
            functionCall = makeScaleCall(
                "scaleBand",
                domainName,
                rangeName,
                0.5,
                0,
                0
            );
            break;

        case "band":
            functionCall = makeScaleCall(
                "scaleBand",
                domainName,
                rangeName,
                scale.paddingInner(),
                scale.paddingOuter(),
                encoding.band ?? 0.5
            );
            break;

        case "ordinal":
            functionCall = makeScaleCall("scaleIdentity");
            break;

        case "identity":
            functionCall = makeScaleCall("scaleIdentity");
            break;

        default:
            // TODO: Implement log, sqrt, etc...
            throw new Error(
                `Unsupported scale type: ${
                    scale.type
                }! ${channel}: ${JSON.stringify(encoding)}`
            );
    }

    if (
        (isContinuous(scale.type) || isDiscrete(scale.type)) &&
        channel == primary
    ) {
        glsl.push(`uniform ${fp64 ? "vec4" : "vec2"} ${domainName};`);
    }

    // N.B. Interpolating scales require unit range
    const range = isInterpolating(scale.type)
        ? [0, 1]
        : scale.range
        ? scale.range()
        : undefined;

    if (range && channel == primary && range.every(isNumber)) {
        const vectorizedRange = vectorizeRange(range);

        // Range needs no runtime adjustment (at least for now). Thus, pass it as a constant that the
        // GLSL compiler can optimize away in the case of unit ranges.
        glsl.push(
            `const ${vectorizedRange.type} ${rangeName} = ${vectorizedRange};`
        );
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
    if (isColorChannel(channel)) {
        const textureUniformName = `uRangeTexture_${channel}`;
        glsl.push(`uniform sampler2D ${textureUniformName};`);
        if (isInterpolating(scale.type)) {
            interpolate = `getInterpolatedColor(${textureUniformName}, transformed)`;
        } else if (transform == "ordinal") {
            interpolate = `getDiscreteColor(${textureUniformName}, int(transformed))`;
        } else {
            throw new Error("Problem with color scale!");
        }
    }

    // Declare the data
    if (datum !== undefined) {
        // Datums could also be provided as uniforms, allowing for modifications
        glsl.push(
            `const highp ${attributeType} ${attributeName} = ${vectorize(
                fp64 ? fp64ify(datum) : datum
            )};`
        );
    } else {
        glsl.push(`in highp ${attributeType} ${attributeName};`);
    }

    // Channel's scale function
    glsl.push(`
${returnType} ${SCALE_FUNCTION_PREFIX}${channel}(${attributeType} value) {
    float transformed = ${functionCall};
    ${
        scale.clamp && scale.clamp()
            ? `transformed = clampToRange(transformed, ${vectorizeRange(
                  range
              )});`
            : ""
    }
    return ${interpolate ?? "transformed"};
}`);

    // A convenience getter for the scaled value
    glsl.push(`
${returnType} ${SCALED_FUNCTION_PREFIX}${channel}() {
    return ${SCALE_FUNCTION_PREFIX}${channel}(${attributeName});
}`);

    const concatenated = glsl.join("\n");
    return concatenated;
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

/**
 *
 * @param {number[]} range
 */
function vectorizeRange(range) {
    return vectorize([range[0], peek(range)]);
}

/**
 *
 * @param {string} name
 * @param  {...any} args
 */
function makeFunctionCall(name, ...args) {
    /** @type {string[]} */
    const fixedArgs = [];

    for (const arg of args) {
        if (isNumber(arg)) {
            fixedArgs.push(toDecimal(arg));
        } else if (isArray(arg)) {
            fixedArgs.push(vectorize(arg));
        } else {
            fixedArgs.push(arg);
        }
    }

    return `${name}(${fixedArgs.join(", ")})`;
}
