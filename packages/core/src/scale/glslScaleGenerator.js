import {
    isContinuous,
    isDiscrete,
    isDiscretizing,
    isInterpolating,
} from "vega-scale";
import { isArray, isBoolean, isNumber, isString } from "vega-util";
import { color as d3color } from "d3-color";

import {
    getDiscreteRangeMapper,
    isColorChannel,
    isDatumDef,
    isDiscreteChannel,
    getPrimaryChannel,
    isValueDef,
} from "../encoder/encoder";
import { peek } from "../utils/arrayUtils";

export const ATTRIBUTE_PREFIX = "attr_";
export const DOMAIN_PREFIX = "uDomain_";
export const RANGE_PREFIX = "range_";
export const SCALE_FUNCTION_PREFIX = "scale_";
export const SCALED_FUNCTION_PREFIX = "getScaled_";
export const RANGE_TEXTURE_PREFIX = "uRangeTexture_";

// https://stackoverflow.com/a/47543127
const FLT_MAX = 3.402823466e38;

/**
 * @typedef {import("../spec/channel").Channel} Channel
 */

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
        transform: match[2],
    };
}

/**
 *
 * @param {Channel} channel
 * @param {number | number[] | string | boolean} value
 */
export function generateValueGlsl(channel, value) {
    /** @type {VectorizedValue} */
    let vec;
    if (isDiscreteChannel(channel)) {
        vec = vectorize(getDiscreteRangeMapper(channel)(value));
    } else if (isString(value)) {
        if (isColorChannel(channel)) {
            vec = vectorizeCssColor(value);
        } else {
            throw new Error(
                `String values are not supported on the "${channel}" channel: ${value}`
            );
        }
    } else if (isBoolean(value)) {
        vec = vectorize(value ? 1 : 0);
    } else if (value === null) {
        if (isColorChannel(channel)) {
            vec = vectorize([0, 0, 0]);
        } else {
            throw new Error(
                `null value is not supported on the "${channel}" chanel.`
            );
        }
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
 * @param {Channel} channel
 * @param {any} scale TODO: typing
 * @param {import("../spec/channel").ChannelDef} channelDef
 */
// eslint-disable-next-line complexity
export function generateScaleGlsl(channel, scale, channelDef) {
    if (isValueDef(channelDef)) {
        throw new Error(
            `Cannot create scale for "value": ${JSON.stringify(channelDef)}`
        );
    }

    if (!scale) {
        throw new Error("Scale is undefined");
    }

    const primary = getPrimaryChannel(channel);
    const attributeName = ATTRIBUTE_PREFIX + channel;
    const domainUniformName = DOMAIN_PREFIX + primary;
    const rangeName = RANGE_PREFIX + primary;

    const hp = isHighPrecisionScale(scale.type);
    const attributeType = hp ? "vec2" : "float";

    const domainLength = scale.domain ? scale.domain().length : undefined;

    /** @type {string} */
    let domainUniform;

    /** @type {string[]} The generated shader (concatenated at the end) */
    const glsl = [];

    // For debugging
    glsl.push("");
    glsl.push("/".repeat(70));
    glsl.push(`// Channel: ${channel}`);
    glsl.push("");

    glsl.push(`#define ${channel}_DEFINED`);

    const { transform } = splitScaleType(scale.type);

    /**
     * @param {string} name
     * @param {...any} args
     */
    const makeScaleCall = (name, ...args) =>
        // eslint-disable-next-line no-useless-call
        makeFunctionCall.apply(null, [name, "value", ...args]);

    let functionCall;
    switch (transform) {
        case "linear":
            functionCall = makeScaleCall("scaleLinear", "domain", rangeName);
            break;

        case "log":
            functionCall = makeScaleCall(
                "scaleLog",
                "domain",
                rangeName,
                scale.base()
            );
            break;

        case "symlog":
            functionCall = makeScaleCall(
                "scaleSymlog",
                "domain",
                rangeName,
                scale.constant()
            );
            break;

        case "pow":
        case "sqrt":
            functionCall = makeScaleCall(
                "scalePow",
                "domain",
                rangeName,
                scale.exponent()
            );
            break;

        case "index":
        case "locus":
            functionCall = makeScaleCall(
                "scaleBandHp",
                "domain",
                rangeName,
                scale.paddingInner(),
                scale.paddingOuter(),
                scale.align(),
                // @ts-expect-error TODO: fix typing
                channelDef.band ?? 0.5
            );
            break;
        case "point":
        case "band":
            functionCall = makeScaleCall(
                "scaleBand",
                "domain",
                rangeName,
                scale.paddingInner(),
                scale.paddingOuter(),
                scale.align(),
                // @ts-expect-error TODO: fix typing
                channelDef.band ?? 0.5
            );
            break;

        case "ordinal": // Use identity transform and lookup the value from a texture
        case "null":
        case "identity":
            functionCall = makeScaleCall("scaleIdentity");
            break;

        case "threshold":
            // TODO: Quantile (it's a specialization of threshold scale)
            // TODO: Quantize
            break;

        default:
            // TODO: Implement log, sqrt, etc...
            throw new Error(
                `Unsupported scale type: ${
                    scale.type
                }! ${channel}: ${JSON.stringify(channelDef)}`
            );
    }

    // N.B. Interpolating scales require unit range
    // TODO: Reverse
    const range =
        isInterpolating(scale.type) ||
        (isContinuous(scale.type) && isColorChannel(channel))
            ? [0, 1]
            : scale.range
            ? scale.range()
            : undefined;

    if (range && channel == primary && range.length && range.every(isNumber)) {
        const vectorizedRange = vectorizeRange(range);

        // Range needs no runtime adjustment (at least for now). Thus, pass it as a constant that the
        // GLSL compiler can optimize away in the case of unit ranges.
        glsl.push(
            `const ${vectorizedRange.type} ${rangeName} = ${vectorizedRange};`
        );
    }

    const returnType = isColorChannel(channel) ? "vec3" : "float";

    /**
     * An optional interpolator function that maps the transformed value to the range.
     * @type {string}
     */
    let interpolate;
    if (isColorChannel(channel)) {
        const textureUniformName = RANGE_TEXTURE_PREFIX + primary;
        if (channel == primary) {
            glsl.push(`uniform sampler2D ${textureUniformName};`);
        }
        if (isContinuous(scale.type)) {
            interpolate = `getInterpolatedColor(${textureUniformName}, transformed)`;
        } else if (isDiscrete(scale.type) || isDiscretizing(scale.type)) {
            interpolate = `getDiscreteColor(${textureUniformName}, int(transformed))`;
        } else {
            throw new Error("Problem with color scale!");
        }
    } else if (scale.type === "ordinal" || isDiscretizing(scale.type)) {
        const textureUniformName = RANGE_TEXTURE_PREFIX + primary;
        if (channel == primary) {
            glsl.push(`uniform sampler2D ${textureUniformName};`);
        }
        interpolate = `getDiscreteColor(${textureUniformName}, int(transformed)).r`;
    }

    if (isDatumDef(channelDef)) {
        glsl.push(`uniform highp ${attributeType} ${attributeName};`);
    } else {
        glsl.push(`in highp ${attributeType} ${attributeName};`);
    }

    /** @type {string[]} Channel's scale function*/
    const scaleBody = [];

    const piecewise = isContinuous(scale.type) && domainLength > 2;
    const needsSlot = isDiscretizing(scale.type) || piecewise;

    // 1. If scale is piecewise or discretizing, find a matching slot
    scaleBody.push(`int slot = 0;`);
    if (needsSlot) {
        const name = domainUniformName;
        // Use a simple linear search.
        // This cannot be put into a function because GLSL requires fixed array lengths for parameters.
        scaleBody.push(
            piecewise
                ? `while (slot < ${name}.length() - 2 && value >= ${name}[slot + 1]) { slot++; }`
                : `while (slot < ${name}.length() && value >= ${name}[slot]) { slot++; }`
        );
    }

    const usesDomain =
        isContinuous(scale.type) ||
        isDiscretizing(scale.type) ||
        ["band", "point"].includes(scale.type);

    // 2. transform
    if (functionCall) {
        const name = domainUniformName;
        if (usesDomain) {
            if (hp) {
                scaleBody.push(`vec3 domain = ${name};`);
            } else {
                scaleBody.push(
                    `vec2 domain = vec2(${name}[slot], ${name}[slot + 1]);`
                );
            }
        }

        scaleBody.push(`float transformed = ${functionCall};`);

        if (piecewise) {
            // TODO: Handle range correctly. Now this assumes unit range.
            scaleBody.push(
                `transformed = (float(slot) + transformed) / (float(${name}.length() - 1));`
            );
        }
    } else {
        // Discretizing scale
        scaleBody.push(`float transformed = float(slot);`);
    }

    // 3. clamp
    if ("clamp" in scale && scale.clamp()) {
        scaleBody.push(
            `transformed = clampToRange(transformed, ${vectorizeRange(range)});`
        );
    }

    // 4. interpolate or map to a discrete value
    scaleBody.push(`return ${interpolate ?? "transformed"};`);

    glsl.push(`
${returnType} ${SCALE_FUNCTION_PREFIX}${channel}(${attributeType} value) {
${scaleBody.map((x) => `    ${x}\n`).join("")}
}`);

    // A convenience getter for the scaled value
    glsl.push(`
${returnType} ${SCALED_FUNCTION_PREFIX}${channel}() {
    return ${SCALE_FUNCTION_PREFIX}${channel}(${attributeName});
}`);

    const concatenated = glsl.join("\n");

    if (usesDomain && channel == primary) {
        // Band, point, index, and locus scale need the domain extent (the first and last elements).
        const length =
            isContinuous(scale.type) || isDiscretizing(scale.type)
                ? domainLength
                : 2;
        domainUniform = hp
            ? `highp vec3 ${domainUniformName};`
            : `mediump float ${domainUniformName}[${length}];`;
    }

    return {
        glsl: concatenated,
        domainUniform,
    };
}

/**
 * Adds a trailing decimal zero so that GLSL is happy.
 *
 * @param {number} number
 * @returns {string}
 */
function toDecimal(number) {
    if (!isNumber(number)) {
        throw new Error(`Not a number: ${number}`);
    }

    if (number == Infinity) {
        return "" + FLT_MAX;
    } else if (number == -Infinity) {
        return "" + -FLT_MAX;
    } else {
        let str = `${number}`;
        if (/^(-)?\d+$/.test(str)) {
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
    return vectorize([rgb.r, rgb.g, rgb.b].map((x) => x / 255));
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

/**
 *
 * @param {string} type
 */
export function isHighPrecisionScale(type) {
    return type == "index" || type == "locus";
}

// Maximum precise index number is 2^(23 + 11) ~ 17G
// Higher number increases precision but makes zooming unstable
const BS = 2 ** 11;
const BM = BS - 1;

/**
 * @param {number} x Must be an integer
 * @param {number[]} [arr]
 */
export function splitHighPrecision(x, arr = []) {
    // Using a bitmask is MUCH faster than using modulo (at least on Chrome 112)
    // https://www.wikiwand.com/en/Modulo#Performance_issues
    const lo = x & BM;
    const hi = x - lo;

    arr[0] = hi;
    arr[1] = lo;

    return arr;
}

/**
 * @param {number} x
 */
function exactSplitHighPrecision(x) {
    const lo = x % BS;
    const hi = x - lo;

    return [hi, lo];
}

/**
 * @param {number[]} domain
 */
export function toHighPrecisionDomainUniform(domain) {
    return [...exactSplitHighPrecision(domain[0]), domain[1] - domain[0]];
}
