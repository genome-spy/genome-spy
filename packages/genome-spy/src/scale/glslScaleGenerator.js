import { primaryChannel } from "../encoder/encoder";

export const ATTRIBUTE_PREFIX = "attr_";
export const DOMAIN_PREFIX = "uDomain_";
export const SCALE_FUNCTION_PREFIX = "scale_";
export const SCALED_FUNCTION_PREFIX = "getScaled_";

// https://stackoverflow.com/a/47543127
const FLT_MAX = 3.402823466e38;

/**
 *
 * @param {string} channel
 * @param {number | number[]} value
 */
export function generateValueGlsl(channel, value) {
    const vec = vectorize(value);

    // These could also be passed as uniforms because GPU drivers often handle
    // uniforms as constants and recompile the shader to eliminate dead code etc.
    return `
${vec.type} ${SCALED_FUNCTION_PREFIX}${channel}() {
    // Constant value
    return ${vec};
}`;
}

/**
 *
 * @param {string} channel
 * @param {any} scale
 * @param {number | number[]} [datum] A constant value (in domain), replaces an attribute
 */
export function generateScaleGlsl(channel, scale, datum) {
    const primary = primaryChannel(channel);
    const attributeName = ATTRIBUTE_PREFIX + channel;
    const domainName = DOMAIN_PREFIX + primary;

    let functionCall;
    switch (scale.type) {
        case "linear":
            functionCall = `scaleLinear(value, ${domainName})`;
            break;
        case "identity":
            functionCall = attributeName;
            break;
        default:
            throw new Error("Unsupported scale type: " + scale.type);
    }

    return `
attribute highp float ${attributeName};
${channel == primary ? `uniform vec2 ${domainName};` : ""}

float ${SCALE_FUNCTION_PREFIX}${channel}(float value) {
    return ${functionCall};
}

float ${SCALED_FUNCTION_PREFIX}${channel}() {
    return ${SCALE_FUNCTION_PREFIX}${channel}(${
        datum !== undefined ? vectorize(datum) : attributeName
    });
}`;
}

/**
 * Adds a trailing decimal zero so that GLSL is happy.
 *
 * @param {number} number
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
 * @returns {string & { type: string, numComponents: number }}
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
