import {
    isContinuous,
    isDiscrete,
    isDiscretizing,
    isInterpolating,
} from "vega-scale";
import { isArray, isBoolean, isNumber, isString } from "vega-util";

import {
    getDiscreteRangeMapper,
    isColorChannel,
    isDiscreteChannel,
    getPrimaryChannel,
    isFieldDef,
} from "../encoder/encoder.js";
import { asArray, peek } from "../utils/arrayUtils.js";
import { InternMap } from "internmap";
import { isExprRef } from "../view/paramMediator.js";
import scaleNull from "../utils/scaleNull.js";
import { cssColorToArray } from "./colorUtils.js";

export const ATTRIBUTE_PREFIX = "attr_";
export const DOMAIN_PREFIX = "uDomain_";
export const RANGE_PREFIX = "range_";
export const ACCESSOR_FUNCTION_PREFIX = "accessor_";
export const SCALE_FUNCTION_PREFIX = "scale_";
export const SCALED_FUNCTION_PREFIX = "getScaled_";
export const RANGE_TEXTURE_PREFIX = "uRangeTexture_";
export const PARAM_PREFIX = "uParam_";
export const SELECTION_CHECKER_PREFIX = "checkSelection_";

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
 *
 * @param {Channel} channel
 * @param {number} conditionNumber
 * @returns {string}
 */
export function makeAccessorFunctionName(channel, conditionNumber) {
    return `${ACCESSOR_FUNCTION_PREFIX}${channel}_${conditionNumber}`;
}

/**
 * @typedef {object} AccessorParts
 * @prop {Channel} channel
 * @prop {string} accessorGlsl
 * @prop {string} accessorFunctionName
 * @prop {string} [attributeName]
 * @prop {string} [attributeGlsl]
 * @prop {string} [uniformName]
 * @prop {string} [uniformGlsl]
 * @prop {(x: any) => any} [adjuster]
 */

/**
 * Generates GLSL code for a constant value.
 *
 * @param {Channel} channel
 * @param {number} conditionNumber
 * @param {number | number[] | string | boolean} value
 * @returns {AccessorParts}
 */
export function generateConstantValueGlsl(channel, conditionNumber, value) {
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

    const accessorFunctionName = makeAccessorFunctionName(
        channel,
        conditionNumber
    );
    const accessorGlsl = `
${vec.type} ${accessorFunctionName}() {
    // Constant value
    return ${vec};
}`;

    return {
        channel,
        accessorGlsl,
        accessorFunctionName,
    };
}

/**
 * Generates GLSL code for a dynamic, parameter-driven values. These are mainly
 * used as dynamic mark properties that map to encoding channels.
 *
 * @param {Channel} channel
 * @param {number} conditionNumber
 * @returns {AccessorParts}
 */
export function generateDynamicValueGlslAndUniform(channel, conditionNumber) {
    let dataType = "float";
    /** @type {(x: any) => any} */
    let adjuster = (x) => x;

    if (isColorChannel(channel)) {
        dataType = "vec3";
        adjuster = (x) => cssColorToArray(x);
    }

    const uniformName = `u${capitalize(channel)}_${conditionNumber}`;

    const uniformGlsl = `    // Dynamic value\n    uniform ${dataType} ${uniformName};`;

    const accessorFunctionName = makeAccessorFunctionName(
        channel,
        conditionNumber
    );
    let accessorGlsl = `
${dataType} ${accessorFunctionName}() {
    // Dynamic value
    return ${uniformName};
}`;

    return {
        channel,
        uniformName,
        uniformGlsl,
        accessorGlsl,
        accessorFunctionName,
        adjuster,
    };
}

/**
 * @param {Channel} channel
 * @param {any} scale
 * @param {number} conditionNumber
 * @param {Channel[]} [sharedQuantitativeChannels] Channels that share the same quantitative field
 * @returns {AccessorParts}
 */
export function generateDataGlsl(
    channel,
    scale,
    conditionNumber,
    sharedQuantitativeChannels = [channel]
) {
    const { attributeType } = getAttributeAndArrayTypes(scale, channel);
    const attributeName =
        ATTRIBUTE_PREFIX + makeAttributeName(sharedQuantitativeChannels);

    const attributeGlsl = `in highp ${attributeType} ${attributeName};`;

    const accessorFunctionName = makeAccessorFunctionName(
        channel,
        conditionNumber
    );

    const accessorGlsl = `
${attributeType} ${accessorFunctionName}() {
    return ${attributeName};
}`;

    return {
        channel,
        attributeName,
        attributeGlsl,
        accessorGlsl,
        accessorFunctionName,
    };
}
/**
 * @param {Channel} channel
 * @param {any} scale
 * @param {number} conditionNumber
 * @returns {AccessorParts}
 */
export function generateDatumGlslAndUniform(channel, scale, conditionNumber) {
    const { attributeType } = getAttributeAndArrayTypes(scale, channel);

    // TODO: Use uniform prefix
    const uniformName = ATTRIBUTE_PREFIX + makeAttributeName(channel);
    const uniformGlsl = `    uniform highp ${attributeType} ${uniformName};`;

    const accessorFunctionName = makeAccessorFunctionName(
        channel,
        conditionNumber
    );
    const accessorGlsl = `
${attributeType} ${accessorFunctionName}() {
    return ${uniformName};
}`;

    return {
        channel,
        uniformName,
        uniformGlsl,
        accessorGlsl,
        accessorFunctionName,
    };
}

/**
 *
 * @param {Channel} channel
 * @param {any} scale
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 */
// eslint-disable-next-line complexity
export function generateScaleGlsl(channel, scale, channelDef) {
    scale ??= scaleNull();

    const primary = getPrimaryChannel(channel);
    const domainUniformName = DOMAIN_PREFIX + primary;
    const rangeUniformName = RANGE_PREFIX + primary;

    const { hp, attributeType } = getAttributeAndArrayTypes(scale, channel);

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
            functionCall = makeScaleCall(
                "scaleLinear",
                "domain",
                rangeUniformName
            );
            break;

        case "log":
            functionCall = makeScaleCall(
                "scaleLog",
                "domain",
                rangeUniformName,
                scale.base()
            );
            break;

        case "symlog":
            functionCall = makeScaleCall(
                "scaleSymlog",
                "domain",
                rangeUniformName,
                scale.constant()
            );
            break;

        case "pow":
        case "sqrt":
            functionCall = makeScaleCall(
                "scalePow",
                "domain",
                rangeUniformName,
                scale.exponent()
            );
            break;

        case "index":
        case "locus":
            functionCall = makeScaleCall(
                "scaleBandHp",
                "domain",
                rangeUniformName,
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
                rangeUniformName,
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

    const range = getRangeForGlsl(scale, channel);

    /** @type {string} */
    let rangeUniform;

    if (range && channel == primary) {
        const rangeProp = scale.props.range ?? [];
        // Maybe the scale could be annotated with a "dynamicRange" property or something
        if (isExprRef(rangeProp) || rangeProp.some(isExprRef)) {
            // TODO: should check that we don't have an ordinal range here as it should be
            // handled using a texture.
            if (range.length < 1 || range.length > 4) {
                // TODO: Use an array instead of (float|vec[234]). This is likely to be a rare case, however.
                throw new Error(
                    `A range with ExprRefs must have 1-4 elements, not ${
                        range.length
                    }! Range: ${JSON.stringify(range)}`
                );
            }
            rangeUniform = `    uniform ${getFloatVectorType(
                range.length
            )} ${rangeUniformName};`;
        } else if (range.length && range.every(isNumber)) {
            const vectorizedRange = vectorizeRange(range);

            glsl.push(
                `const ${vectorizedRange.type} ${rangeUniformName} = ${vectorizedRange};`
            );
        }
    }

    const returnType = getScaledDataTypeForChannel(channel);

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
            `transformed = clampToRange(transformed, ${rangeUniformName});`
        );
    }

    // 4. interpolate or map to a discrete value
    scaleBody.push(`return ${interpolate ?? "transformed"};`);

    glsl.push(`
${returnType} ${SCALE_FUNCTION_PREFIX}${channel}(${attributeType} value) {
${scaleBody.map((x) => `    ${x}\n`).join("")}
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
        glsl: concatenated,
        domainUniformName,
        domainUniform,
        rangeUniformName,
        rangeUniform,
    };
}

/**
 *
 * @param {Channel} channel
 * @param {import("../types/encoder.js").Accessor[]} accessors
 */
export function generateConditionalEncoderGlsl(channel, accessors) {
    const type = getScaledDataTypeForChannel(channel);

    /** @type {string[]}  */
    const conditions = [];
    /** @type {string[]}  */
    const statements = [];

    for (let i = 0; i < accessors.length; i++) {
        const accessor = accessors[i];
        const accessorFunctionName = makeAccessorFunctionName(channel, i);
        const { param, empty } = accessor.predicate;

        conditions.push(
            param ? `${SELECTION_CHECKER_PREFIX}${param}(${!!empty})` : null
        );

        statements.push(
            accessor.scaleChannel
                ? `return ${SCALE_FUNCTION_PREFIX}${channel}(${accessorFunctionName}());`
                : `return ${accessorFunctionName}();`
        );
    }

    return `${type} ${SCALED_FUNCTION_PREFIX}${channel}() {
${ifElseGlsl(conditions, statements)}
}

#define ${channel}_DEFINED`;
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

    const type = getFloatVectorType(numComponents);
    const str = `${type}(${value.map(toDecimal).join(", ")})`;

    return Object.assign(str, { type, numComponents });
}

/**
 * @param {number} numComponents
 */
function getFloatVectorType(numComponents) {
    switch (numComponents) {
        case 1:
            return "float";
        case 2:
            return "vec2";
        case 3:
            return "vec3";
        case 4:
            return "vec4";
        default:
            throw new Error("Invalid number of components: " + numComponents);
    }
}

/**
 * @param {Channel} channel
 */
export function getScaledDataTypeForChannel(channel) {
    return isColorChannel(channel)
        ? "vec3"
        : channel == "uniqueId"
          ? "uint"
          : "float";
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
 *
 * @param {import("../types/encoder.js").VegaScale} scale
 * @param {import("../spec/channel.js").Channel} channel
 */
export function getAttributeAndArrayTypes(scale, channel) {
    const discrete = scale && isDiscrete(scale.type);
    const hp = scale && isHighPrecisionScale(scale.type);
    const largeHp = hp && isLargeGenome(scale.domain());

    /**
     * @type {{attributeType: string, arrayConstructor: Uint32ArrayConstructor | Uint16ArrayConstructor | Float32ArrayConstructor}}
     */
    const props = largeHp
        ? { attributeType: "uvec2", arrayConstructor: Uint32Array }
        : hp
          ? { attributeType: "uint", arrayConstructor: Uint32Array }
          : discrete
            ? { attributeType: "uint", arrayConstructor: Uint16Array }
            : channel == "uniqueId"
              ? { attributeType: "uint", arrayConstructor: Uint32Array }
              : { attributeType: "float", arrayConstructor: Float32Array };

    return Object.assign(props, {
        numComponents: +(props.attributeType.match(/^vec([234])$/)?.[1] ?? 1),
        discrete,
        hp,
        largeHp,
    });
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
                    ? ((isContinuous(encoder.scale.type) ||
                          isDiscretizing(encoder.scale.type)) ??
                      false)
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

/**
 * N.B. Interpolating scales require unit range
 * TODO: Reverse
 * @param {any} scale
 * @param {Channel} channel
 * @returns {number[]}
 */
export const getRangeForGlsl = (scale, channel) =>
    isInterpolating(scale.type) ||
    (isContinuous(scale.type) && isColorChannel(channel))
        ? [0, 1]
        : scale.range
          ? scale.range()
          : undefined;

/**
 * @param {string[]} conditions
 * @param {string[]} statements
 * @returns {string}
 */
export function ifElseGlsl(conditions, statements) {
    if (conditions.length != statements.length) {
        throw new Error("Unequal array lengths");
    }

    const n = conditions.length;

    if (n == 0) {
        return "";
    } else if (n == 1 && conditions[0] == null) {
        return statements[0];
    }

    const parts = [];
    for (let i = 0; i < n; i++) {
        const condition = conditions[i];
        const ifelse =
            i == 0
                ? `if (${condition})`
                : condition == null && i == n - 1
                  ? `else`
                  : `else if (${condition})`;
        parts.push(
            `    ${ifelse} {
        ${statements[i]}
    }`
        );
    }

    return parts.join("\n");
}
