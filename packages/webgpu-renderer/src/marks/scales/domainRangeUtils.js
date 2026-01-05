import { cssColorToArray } from "../../utils/colorUtils.js";
import { HASH_EMPTY_KEY } from "../../utils/hashTable.js";
import { packHighPrecisionDomain } from "../../utils/highPrecision.js";
import { isPiecewiseScale } from "./scaleUtils.js";
import { getScaleResourceRequirements } from "./scaleDefs.js";

/**
 * @typedef {"continuous"|"threshold"|"piecewise"} DomainRangeKind
 */

/**
 * @param {string} scaleType
 * @returns {boolean}
 */
export function scaleUsesDomainRange(scaleType) {
    return (
        getScaleResourceRequirements(scaleType, false).domainRangeKind !== null
    );
}

/**
 * @param {import("../../index.d.ts").ChannelScale | undefined} scale
 * @returns {DomainRangeKind | null}
 */
export function getDomainRangeKind(scale) {
    if (!scale) {
        return null;
    }
    return getScaleResourceRequirements(
        scale.type ?? "identity",
        isPiecewiseScale(scale)
    ).domainRangeKind;
}

/**
 * @param {string} name
 * @param {DomainRangeKind} kind
 * @param {import("../../index.d.ts").ChannelScale} scale
 * @returns {{ domainLength: number, rangeLength: number }}
 */
export function getDomainRangeLengths(name, kind, scale) {
    if (kind === "continuous") {
        if (scale.type === "index") {
            return { domainLength: 3, rangeLength: 2 };
        }
        return { domainLength: 2, rangeLength: 2 };
    }

    const domain = Array.isArray(scale.domain) ? scale.domain : [];
    const range = Array.isArray(scale.range) ? scale.range : [];

    if (kind === "threshold") {
        if (domain.length === 0) {
            throw new Error(
                `Threshold scale on "${name}" must define a non-empty domain.`
            );
        }
        if (range.length < 2) {
            throw new Error(
                `Threshold scale on "${name}" must define at least two range entries.`
            );
        }
        if (range.length !== domain.length + 1) {
            throw new Error(
                `Threshold scale on "${name}" requires range length of ${
                    domain.length + 1
                }, got ${range.length}.`
            );
        }
        return { domainLength: domain.length, rangeLength: range.length };
    }

    if (domain.length < 2) {
        throw new Error(
            `Piecewise scale on "${name}" must define at least two domain entries.`
        );
    }
    if (range.length < 2) {
        throw new Error(
            `Piecewise scale on "${name}" must define at least two range entries.`
        );
    }
    if (range.length !== domain.length) {
        throw new Error(
            `Piecewise scale on "${name}" requires range length of ${domain.length}, got ${range.length}.`
        );
    }
    return { domainLength: domain.length, rangeLength: range.length };
}

/**
 * @param {import("../../index.d.ts").ChannelScale | undefined} scale
 * @returns {boolean}
 */
export function usesOrdinalDomainMap(scale) {
    if (!scale) {
        return false;
    }
    return scale.type === "band" || scale.type === "ordinal";
}

/**
 * @param {string} name
 * @param {"band"|"ordinal"} scaleType
 * @param {ArrayLike<number>|undefined} domain
 * @returns {number[] | null}
 */
export function normalizeOrdinalDomain(name, scaleType, domain) {
    if (!domain) {
        return null;
    }
    const values = Array.from(domain, (value) => {
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
            throw new Error(
                `Ordinal domain on "${name}" requires integer u32 values.`
            );
        }
        if (value < 0 || value > HASH_EMPTY_KEY) {
            throw new Error(
                `Ordinal domain on "${name}" must fit in u32 values.`
            );
        }
        if (value === HASH_EMPTY_KEY) {
            throw new Error(
                `Ordinal domain on "${name}" must not contain 0xffffffff.`
            );
        }
        return value >>> 0;
    });
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) {
            throw new Error(
                `Ordinal domain on "${name}" must not contain duplicates.`
            );
        }
        seen.add(value);
    }
    return values;
}

/**
 * @param {string} name
 * @param {import("../../index.d.ts").ChannelConfigResolved} channel
 * @param {import("../../index.d.ts").ChannelScale} scale
 * @param {DomainRangeKind} kind
 * @param {(name: string) => number[] | null | undefined} getDefaultScaleRange
 * @returns {{ domain: number[], range: Array<number|number[]>, domainLength: number, rangeLength: number }}
 */
export function normalizeDomainRange(
    name,
    channel,
    scale,
    kind,
    getDefaultScaleRange
) {
    const outputComponents = channel.components ?? 1;
    const { domainLength, rangeLength } = getDomainRangeLengths(
        name,
        kind,
        scale
    );

    if (kind === "continuous") {
        const domain = Array.isArray(scale.domain) ? scale.domain : [0, 1];
        const range = Array.isArray(scale.range)
            ? scale.range
            : (getDefaultScaleRange(name) ?? [0, 1]);
        if (typeof range[0] !== "number" || typeof range[1] !== "number") {
            throw new Error(`Scale range for "${name}" must be numeric.`);
        }
        const numericRange = /** @type {number[]} */ (range);
        if (scale.type === "band") {
            const ordinalDomain = normalizeOrdinalDomain(
                name,
                "band",
                Array.isArray(scale.domain) || ArrayBuffer.isView(scale.domain)
                    ? scale.domain
                    : undefined
            );
            if (ordinalDomain) {
                return {
                    domain: [0, ordinalDomain.length],
                    range: [numericRange[0] ?? 0, numericRange[1] ?? 1],
                    domainLength,
                    rangeLength,
                };
            }
        }
        if (scale.type === "index") {
            if (domain.length === 3) {
                return {
                    domain: [domain[0], domain[1], domain[2]],
                    range: [numericRange[0] ?? 0, numericRange[1] ?? 1],
                    domainLength,
                    rangeLength,
                };
            }
            if (domain.length !== 2) {
                throw new Error(
                    `Scale domain for "${name}" must have 2 or 3 entries for "${scale.type}" scales.`
                );
            }
            const packed = packHighPrecisionDomain(domain[0], domain[1]);
            return {
                domain: packed,
                range: [numericRange[0] ?? 0, numericRange[1] ?? 1],
                domainLength,
                rangeLength,
            };
        }
        return {
            domain: [domain[0] ?? 0, domain[1] ?? 1],
            range: [numericRange[0] ?? 0, numericRange[1] ?? 1],
            domainLength,
            rangeLength,
        };
    }

    const domain = /** @type {number[]} */ (scale.domain ?? []);
    if (isRangeFunction(scale.range)) {
        const label = kind === "threshold" ? "Threshold" : "Piecewise";
        throw new Error(
            `${label} scale on "${name}" does not support interpolator ranges.`
        );
    }
    const range = normalizeDiscreteRange(
        name,
        /** @type {Array<number|number[]|string>|undefined} */ (scale.range),
        outputComponents,
        kind
    );

    return { domain, range, domainLength, rangeLength };
}

/**
 * @param {string} name
 * @param {Array<number|number[]|string>|undefined} range
 * @param {1|2|4} outputComponents
 * @param {"threshold"|"piecewise"} kind
 * @returns {Array<number|number[]>}
 */
export function normalizeDiscreteRange(name, range, outputComponents, kind) {
    const label = kind === "threshold" ? "Threshold" : "Piecewise";
    if (!Array.isArray(range) || range.length < 2) {
        throw new Error(
            `${label} scale on "${name}" must define at least two range entries.`
        );
    }
    return range.map((value) =>
        normalizeDiscreteRangeValue(name, value, outputComponents, label)
    );
}

/**
 * @param {string} name
 * @param {number|number[]|string} value
 * @param {1|2|4} outputComponents
 * @param {string} label
 * @returns {number|number[]}
 */
export function normalizeDiscreteRangeValue(
    name,
    value,
    outputComponents,
    label
) {
    if (outputComponents === 1) {
        if (typeof value === "number") {
            return value;
        }
        throw new Error(
            `${label} scale on "${name}" expects numeric range values.`
        );
    }

    if (Array.isArray(value)) {
        if (value.length === 4) {
            return value;
        }
        if (value.length === 3) {
            return [...value, 1];
        }
    }
    if (typeof value === "string") {
        return [...cssColorToArray(value), 1];
    }
    throw new Error(
        `${label} scale on "${name}" expects vec4 range values or CSS colors.`
    );
}

/**
 * @param {number|number[]|{ domain?: number[], range?: Array<number|number[]|string> }} value
 * @param {"domain"|"range"} suffix
 * @returns {[number, number]}
 */
export function coerceRangeValue(value, suffix) {
    if (Array.isArray(value)) {
        if (typeof value[0] !== "number" || typeof value[1] !== "number") {
            throw new Error(`Scale ${suffix} update expects numeric values.`);
        }
        return [value[0] ?? 0, value[1] ?? 1];
    }
    if (typeof value == "object" && value) {
        const pair = suffix === "domain" ? value.domain : value.range;
        if (
            !pair ||
            typeof pair[0] !== "number" ||
            typeof pair[1] !== "number"
        ) {
            throw new Error(`Scale ${suffix} update expects numeric values.`);
        }
        return [pair?.[0] ?? 0, pair?.[1] ?? 1];
    }
    return [0, 1];
}

/**
 * @param {string} name
 * @param {Array<number|number[]|string>|undefined} range
 * @param {1|2|4} outputComponents
 * @returns {Array<number|number[]>}
 */
export function normalizeOrdinalRange(name, range, outputComponents) {
    if (!Array.isArray(range) || range.length === 0) {
        throw new Error(
            `Ordinal scale on "${name}" must define at least one range entry.`
        );
    }
    return range.map((value) =>
        normalizeDiscreteRangeValue(name, value, outputComponents, "Ordinal")
    );
}

/**
 * @param {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn|undefined} range
 * @returns {boolean}
 */
export function isColorRange(range) {
    if (!Array.isArray(range) || range.length === 0) {
        return false;
    }
    return range.every(
        (value) =>
            typeof value === "string" ||
            (Array.isArray(value) && (value.length === 3 || value.length === 4))
    );
}

/**
 * @param {number[]} domain
 * @returns {number[]}
 */
export function normalizeDomainPositions(domain) {
    const start = domain[0] ?? 0;
    const stop = domain[domain.length - 1] ?? 1;
    const span = stop - start || 1;
    return domain.map((value) => (value - start) / span);
}

/**
 * @param {number} length
 * @returns {number[]}
 */
export function normalizeRangePositions(length) {
    if (length <= 0) {
        return [];
    }
    if (length === 1) {
        return [0];
    }
    const denom = length - 1;
    const positions = new Array(length);
    for (let i = 0; i < length; i++) {
        positions[i] = i / denom;
    }
    return positions;
}

/**
 * @param {unknown} range
 * @returns {range is import("../../index.d.ts").ColorInterpolatorFn}
 */
export function isRangeFunction(range) {
    return typeof range === "function";
}

/**
 * @param {import("../../index.d.ts").ChannelScale | undefined} scale
 * @param {number} outputComponents
 * @returns {boolean}
 */
export function usesRangeTexture(scale, outputComponents) {
    if (!scale) {
        return false;
    }
    const rangeFn = isRangeFunction(scale.range);
    const colorRange = isColorRange(scale.range);
    const interpolateEnabled =
        rangeFn || scale.interpolate !== undefined || colorRange;
    if (!interpolateEnabled || outputComponents !== 4) {
        return false;
    }
    return ["linear", "log", "pow", "sqrt", "symlog"].includes(scale.type);
}
