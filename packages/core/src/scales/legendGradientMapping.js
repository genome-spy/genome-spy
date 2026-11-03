import createScale from "../scale/scale.js";
/** @typedef {((value: number) => number) & { invert: (position: number) => number }} NormalizedPositionScale */
/**
 * @param {import("../types/encoder.js").VegaScale} scale
 * @param {number} start
 * @param {number} stop
 * @param {boolean} [strict]
 * @returns {NormalizedPositionScale}
 */
export function createNormalizedScale(scale, start, stop, strict = false) {
    const domain = getNumericScaleDomain(scale, start, stop);
    const range = createNormalizedRange(domain.length);

    if (
        "copy" in scale &&
        typeof scale.copy == "function" &&
        "invert" in scale &&
        typeof scale.invert == "function"
    ) {
        const normalizedScale = scale.copy();
        normalizedScale.domain(domain);
        normalizedScale.range(range);
        return /** @type {NormalizedPositionScale} */ (normalizedScale);
    }

    const props = /** @type {{ props?: import("../spec/scale.js").Scale }} */ (
        scale
    ).props;
    const type = props?.type;

    if (type) {
        const positionProps = { ...props };
        const extraPositionProps = /** @type {Record<string, unknown>} */ (
            positionProps
        );
        delete positionProps.range;
        delete positionProps.scheme;
        delete extraPositionProps.domainMin;
        delete extraPositionProps.domainMid;
        delete extraPositionProps.domainMax;
        delete extraPositionProps.schemeExtent;
        delete extraPositionProps.schemeCount;
        const positionScale = createScale({
            ...positionProps,
            type,
            domain,
            range,
            zero: false,
            nice: false,
        });
        if (
            "invert" in positionScale &&
            typeof positionScale.invert == "function"
        ) {
            return /** @type {NormalizedPositionScale} */ (positionScale);
        }
    }

    if (strict)
        throw new Error(
            "Gradient brushing requires an exact invertible position mapping."
        );
    return createLinearPositionScale(start, stop);
}

/**
 * @param {import("../types/encoder.js").VegaScale} scale
 * @param {number} start
 * @param {number} stop
 * @returns {number[]}
 */
function getNumericScaleDomain(scale, start, stop) {
    if ("domain" in scale && typeof scale.domain == "function") {
        const domain = scale.domain().map(finiteNumber);
        if (domain.length >= 2) {
            return [start, ...domain.slice(1, -1), stop];
        }
    }

    return [start, stop];
}

/**
 * @param {number} length
 * @returns {number[]}
 */
function createNormalizedRange(length) {
    const last = length - 1;
    return Array.from({ length }, (_, index) => index / last);
}

/**
 * @param {number} start
 * @param {number} stop
 * @returns {(position: number) => number}
 */
function createLinearPositionInverter(start, stop) {
    return (position) => start + (stop - start) * position;
}

/**
 * @param {number} start
 * @param {number} stop
 * @returns {NormalizedPositionScale}
 */
export function createLinearPositionScale(start, stop) {
    const scale = /** @type {NormalizedPositionScale} */ (
        (/** @type {number} */ value) => (value - start) / (stop - start)
    );
    scale.invert = createLinearPositionInverter(start, stop);
    return scale;
}

/** @param {unknown} value */
function finiteNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        throw new Error("Gradient legend boundaries must be finite numbers.");
    return number;
}
