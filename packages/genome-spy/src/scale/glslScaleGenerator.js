import { primaryChannel } from "../encoder/encoder";
import { isContinuous } from "vega-scale";
import { fp64ify } from "../gl/includes/fp64-utils";

export const ATTRIBUTE_PREFIX = "attr_";
export const DOMAIN_PREFIX = "uDomain_";
export const RANGE_PREFIX = "range_";
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
    let glsl = `
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
 * @param {object} extra
 * @param {number} [extra.datum] A constant value (in domain), replaces an attribute
 */
// eslint-disable-next-line complexity
export function generateScaleGlsl(channel, scale, { datum } = {}) {
    const primary = primaryChannel(channel);
    const attributeName = ATTRIBUTE_PREFIX + channel;
    const domainName = DOMAIN_PREFIX + primary;
    const rangeName = RANGE_PREFIX + primary;

    const fp64 = scale.fp64;
    const fp64Suffix = fp64 ? "Fp64" : "";
    const attributeType = fp64 ? "vec2" : "float";

    let functionCall;
    switch (scale.type) {
        case "locus":
        case "linear":
            functionCall = `scaleLinear${fp64Suffix}(value, ${domainName}, ${rangeName})`;
            break;
        case "band":
        case "point":
            functionCall = "value";
            break;
        case "identity":
            functionCall = `scaleIdentity${fp64Suffix}(value)`;
            break;
        default:
            throw new Error("Unsupported scale type: " + scale.type);
    }

    const domainDef =
        isContinuous(scale.type) && channel == primary
            ? `uniform ${fp64 ? "vec4" : "vec2"} ${domainName};`
            : "";

    const range = scale.range ? vectorize(scale.range()) : undefined;

    // Range needs no runtime adjustment. Thus, pass it as a constant that the
    // GLSL compiler can optimize away in the case of unit ranges.
    const rangeDef =
        range && channel == primary
            ? `const ${range.type} ${rangeName} = ${range};`
            : "";

    return `
#define ${channel}_DEFINED
${fp64 ? `#define ${channel}_FP64` : ""}

${domainDef}
${rangeDef}
attribute highp ${attributeType} ${attributeName};

float ${SCALE_FUNCTION_PREFIX}${channel}(${attributeType} value) {
    float scaled = ${functionCall};
    ${
        scale.clamp && scale.clamp()
            ? `scaled = clamp(scaled, ${scale
                  .range()
                  .map(toDecimal)
                  .join(", ")});`
            : ""
    }
    return scaled;
}

float ${SCALED_FUNCTION_PREFIX}${channel}() {
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
