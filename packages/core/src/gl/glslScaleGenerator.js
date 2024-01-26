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
    isFieldDef,
} from "../encoder/encoder.js";
import { asArray, peek } from "../utils/arrayUtils.js";
import { InternMap } from "internmap";
import { isExprRef } from "../marks/mark.js";
import scaleNull from "../utils/scaleNull.js";

export const ATTRIBUTE_PREFIX = "attr_";
export const DOMAIN_PREFIX = "uDomain_";
export const RANGE_PREFIX = "range_";
export const SCALE_FUNCTION_PREFIX = "scale_";
export const SCALED_FUNCTION_PREFIX = "getScaled_";
export const RANGE_TEXTURE_PREFIX = "uRangeTexture_";

// https://stackoverflow.com/a/47543127
const FLT_MAX = 3.402823466e38;

/**
 * @typedef {import("../spec/channel.js").Channel} Channel
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
 * Generates GLSL code for a constant value.
 *
 * @param {Channel} channel
 * @param {number | number[] | string | boolean} value
 */
export function generateConstantValueGlsl(channel, value) {
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

    let glsl = `
#define ${channel}_DEFINED
${vec.type} ${SCALED_FUNCTION_PREFIX}${channel}() {
    // Constant value
    return ${vec};
}`;
    return glsl;
}

/**
 * Generates GLSL code for a dynamic, parameter-driven values. These are mainly
 * used as dynamic mark properties that map to encoding channels.
 *
 * @param {Channel} channel
 */
export function generateDynamicValueGlslAndUniform(channel) {
    let dataType = "float";
    /** @type {(x: any) => any} */
    let adjuster = (x) => x;

    if (isColorChannel(channel)) {
        dataType = "vec3";
        adjuster = (x) => cssColorToArray(x);
    }

    const uniformName = `u${capitalize(channel)}`;

    const uniformGlsl = `    // Dynamic value\n    uniform ${dataType} ${uniformName};`;

    let scaleGlsl = `
#define ${channel}_DEFINED
${dataType} ${SCALED_FUNCTION_PREFIX}${channel}() {
    // Dynamic value
    return ${uniformName};
}`;

    return {
        channel,
        uniformName,
        uniformGlsl,
        scaleGlsl,
        adjuster,
    };
}

/**
 *
 * @param {Channel} channel
 * @param {import("../view/scaleResolution.js").default} scaleResolution TODO: typing
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @param {Channel[]} [sharedQuantitativeChannels] Channels that share the same quantitative field
 */
// eslint-disable-next-line complexity
export function generateScaleGlsl(
    channel,
    scaleResolution,
    channelDef,
    sharedQuantitativeChannels = [channel]
) {
    if (isValueDef(channelDef)) {
        throw new Error(
            `Cannot create scale for "value": ${JSON.stringify(channelDef)}`
        );
    }

    /**
     * Typecast to any to make it easier to handle all the different scale variants
     * @type {any}
     */
    const scale = scaleResolution ? scaleResolution.scale : scaleNull();

    const primary = getPrimaryChannel(channel);
    const attributeName =
        ATTRIBUTE_PREFIX + makeAttributeName(sharedQuantitativeChannels);
    const domainUniformName = DOMAIN_PREFIX + primary;
    const rangeName = RANGE_PREFIX + primary;

    // The attribute has discrete values
    const discrete = isDiscrete(scale.type);

    const hp = isHighPrecisionScale(scale.type);
    const largeHp = hp && isLargeGenome(scale.domain());

    const attributeType = largeHp
        ? "uvec2"
        : hp
        ? "uint"
        : discrete
        ? "uint"
        : "float";

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

    /** @type {string} */
    let rangeUniform;

    if (range && channel == primary) {
        const rangeProp = scale.props.range ?? [];
        // Maybe the scale could be annotated with a "dynamicRange" property or something
        if (isExprRef(rangeProp) || rangeProp.some(isExprRef)) {
            if (range.length != 2) {
                throw new Error(
                    "A range with ExprRefs must have exactly two elements!"
                );
                // TODO: Use an array instead of vec2. This is likely to be a rare case, however.
            }
            rangeUniform = `uniform vec2 ${rangeName};`;
        } else if (range.length && range.every(isNumber)) {
            const vectorizedRange = vectorizeRange(range);

            glsl.push(
                `const ${vectorizedRange.type} ${rangeName} = ${vectorizedRange};`
            );
        }
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

    const [attributeGlsl, markUniformGlsl] = isDatumDef(channelDef)
        ? [undefined, `  uniform highp ${attributeType} ${attributeName};`]
        : [`in highp ${attributeType} ${attributeName};`, undefined];

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
            ? `    highp vec3 ${domainUniformName};`
            : `    mediump float ${domainUniformName}[${length}];`;
    }

    return {
        attributeName,
        attributeGlsl,
        // Ends up in the Mark uniform block
        markUniformGlsl,
        glsl: concatenated,
        domainUniformName,
        domainUniform,
        rangeUniform,
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
function cssColorToArray(color) {
    const rgb = d3color(color).rgb();
    return [rgb.r, rgb.g, rgb.b].map((x) => x / 255);
}

/**
 * @param {string} color
 */
function vectorizeCssColor(color) {
    return vectorize(cssColorToArray(color));
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
 * True if scale needs more than 24 bits (float32) of precision.
 *
 * @param {string} type
 */
export function isHighPrecisionScale(type) {
    return type == "index" || type == "locus";
}

/**
 * True if Uint32 cannot represent the domain.
 *
 * @param {number[]} domain
 */
export function isLargeGenome(domain) {
    return domain[1] > 2 ** 32;
}

const LOW_BITS = 12;
const BS = 2 ** LOW_BITS;
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
 * @param {number} x Must be an integer
 * @param {number[]} [arr]
 */
export function splitLargeHighPrecision(x, arr = []) {
    const lo = x % BS;
    const hi = (x - lo) / BS;

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

/**
 * @typedef {[string, boolean]} FieldKey Tuple: [channel, isQuantitative]]
 */

/**
 * Finds duplicated quantitative fields in the encoding block.
 * They need to be uploaded to the GPU only once.
 *
 * @param {Partial<Record<import("../spec/channel.js").Channel, import("../types/encoder.js").Encoder>>} encoders
 */
export function dedupeEncodingFields(encoders) {
    /**
     * Value: an array of channels
     * @type {InternMap<FieldKey, import("../spec/channel.js").Channel[]>}
     */
    const deduped = new InternMap([], JSON.stringify);

    for (const [channel, encoder] of Object.entries(encoders)) {
        const channelDef = encoder.channelDef;
        if (isFieldDef(channelDef)) {
            const field = channelDef.field;

            /** @type {[string, boolean]} */
            const key = [
                field,
                encoder.scale
                    ? (isContinuous(encoder.scale.type) ||
                          isDiscretizing(encoder.scale.type)) ??
                      false
                    : false,
            ];

            deduped.set(key, [...(deduped.get(key) ?? []), channel]);
        }
    }
    return deduped;
}

/**
 * @param {import("../spec/channel.js").Channel | import("../spec/channel.js").Channel[]} channel
 */
export function makeAttributeName(channel) {
    return asArray(channel).join("_");
}

/**
 * @param {string} str
 */
function capitalize(str) {
    return str[0].toUpperCase() + str.slice(1);
}
