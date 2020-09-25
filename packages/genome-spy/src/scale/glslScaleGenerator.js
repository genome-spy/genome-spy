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
    const size = Array.isArray(value) ? value.length : 1;
    if (size < 1 || size > 4) {
        throw new Error("Invalid size: " + size);
    }

    const valueString = Array.isArray(value)
        ? value.map(toDecimal).join(", ")
        : toDecimal(value);

    const type = size == 1 ? "float" : `vec${size}`;

    return `
${type} ${SCALED_FUNCTION_PREFIX}${channel}() {
    // Constant value
    return ${type == "float" ? valueString : `${type}(${valueString})`};
}`;
}

/**
 *
 * @param {string} channel
 * @param {any} scale
 */
export function generateScaleGlsl(channel, scale) {
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
    return ${SCALE_FUNCTION_PREFIX}${channel}(${attributeName});
}`;
}

/**
 * Adds a trailing decimal zero so that GLSL is happy.
 *
 * @param {number} number
 */
function toDecimal(number) {
    if (number == Infinity) {
        return FLT_MAX;
    } else if (number == -Infinity) {
        return -FLT_MAX;
    } else {
        let str = `${number}`;
        if (/^\d+$/.test(str)) {
            str += ".0";
        }
        return str;
    }
}
