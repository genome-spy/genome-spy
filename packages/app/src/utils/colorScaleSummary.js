/**
 * @typedef {{ domain: unknown[], range: string[] }} ConcreteColorScale
 */

/**
 * Extracts a concrete color scale domain and string range from a runtime scale.
 *
 * @param {unknown} scale
 * @returns {ConcreteColorScale | undefined}
 */
export function getConcreteColorScale(scale) {
    const candidate =
        /** @type {{ domain?: unknown; range?: unknown } | undefined} */ (
            scale
        );
    if (
        !candidate ||
        typeof candidate.domain !== "function" ||
        typeof candidate.range !== "function"
    ) {
        return;
    }

    const domain = candidate.domain();
    const range = candidate.range();
    if (
        Array.isArray(domain) &&
        Array.isArray(range) &&
        range.every((value) => typeof value === "string")
    ) {
        return { domain, range };
    }
}

/**
 * Adds color properties to items by matching item values to a scale domain.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => unknown} getValue
 * @param {unknown} domain
 * @param {unknown} range
 * @returns {Array<T & { color?: string }>}
 */
export function addValueColors(items, getValue, domain, range) {
    const colorsByValue = createColorMap(domain, range);
    if (!colorsByValue) {
        return items;
    }

    return items.map((item) => {
        const color = colorsByValue.get(getValue(item));
        return color !== undefined ? { ...item, color } : item;
    });
}

/**
 * @param {unknown} domain
 * @param {unknown} range
 * @returns {Map<unknown, string> | undefined}
 */
function createColorMap(domain, range) {
    if (
        !Array.isArray(domain) ||
        !Array.isArray(range) ||
        !range.every((color) => typeof color === "string")
    ) {
        return;
    }

    /** @type {Map<unknown, string>} */
    const colorsByValue = new Map();
    domain.forEach((value, index) => {
        const color = range[index];
        if (typeof color === "string") {
            colorsByValue.set(value, color);
        }
    });
    return colorsByValue;
}
