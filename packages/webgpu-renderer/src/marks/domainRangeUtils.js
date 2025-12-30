import { cssColorToArray } from "../utils/colorUtils.js";
import { getScaleUniformDef, isPiecewiseScale } from "./scaleCodegen.js";

/**
 * @typedef {"continuous"|"threshold"|"piecewise"} DomainRangeKind
 */

/**
 * @param {string} scaleType
 * @returns {boolean}
 */
export function scaleUsesDomainRange(scaleType) {
    return getScaleUniformDef(scaleType).domainRange;
}

/**
 * @param {import("../index.d.ts").ChannelScale | undefined} scale
 * @returns {DomainRangeKind | null}
 */
export function getDomainRangeKind(scale) {
    if (!scale) {
        return null;
    }
    if (scale.type === "threshold") {
        return "threshold";
    }
    if (isPiecewiseScale(scale)) {
        return "piecewise";
    }
    if (scaleUsesDomainRange(scale.type ?? "identity")) {
        return "continuous";
    }
    return null;
}

/**
 * @param {string} name
 * @param {DomainRangeKind} kind
 * @param {import("../index.d.ts").ChannelScale} scale
 * @returns {{ domainLength: number, rangeLength: number }}
 */
export function getDomainRangeLengths(name, kind, scale) {
    if (kind === "continuous") {
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
 * @param {string} name
 * @param {import("../index.d.ts").ChannelConfigResolved} channel
 * @param {import("../index.d.ts").ChannelScale} scale
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
        return {
            domain: [domain[0] ?? 0, domain[1] ?? 1],
            range: [numericRange[0] ?? 0, numericRange[1] ?? 1],
            domainLength,
            rangeLength,
        };
    }

    const domain = /** @type {number[]} */ (scale.domain ?? []);
    const range = normalizeDiscreteRange(
        name,
        scale.range,
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
