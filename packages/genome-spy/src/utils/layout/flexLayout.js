import { isNumber } from "vega-util";
import { isStepSize } from "../../view/view";

/**
 *
 * Layout calculation inspired by flexbox. The elements may have an
 * absolute size (in pixels) and a growth component for filling the
 * remaining space.
 *
 * Read more at https://css-tricks.com/flex-grow-is-weird/
 *
 * @typedef {object} SizeDef Size definition inspired by CSS flexbox
 * @prop {number} [px] Size in pixels
 * @prop {number} [grow] Share of remaining space
 *
 * @typedef {object} LocSize One-dimensional location and size
 * @prop {number} location
 * @prop {number} size
 *
 * @typedef {object} FlexOptions
 * @prop {number} [spacing] gap between items in pixels
 * @prop {number} [devicePixelRatio] allows for snapping to "retina" pixels.
 *      Default: `undefined`, which disables the snapping.
 * @prop {number} [offset] add the offset to all locations. Default: `0`.
 * @prop {boolean} [reverse] fill from "right to left".
 *
 * @param {SizeDef[]} items
 * @param {number} containerSize in pixels
 * @param {FlexOptions} [options]
 * @returns {LocSize[]}
 */
export function mapToPixelCoords(
    items,
    containerSize,
    { spacing, devicePixelRatio, offset, reverse } = {}
) {
    spacing = spacing || 0;
    offset = offset || 0;

    let totalPx = 0;
    let totalGrow = 0;

    for (const size of items) {
        totalPx += z(size.px) + spacing;
        totalGrow += z(size.grow);
    }
    totalPx -= spacing;

    const remainingSpace = Math.max(0, containerSize - totalPx);

    /** @type {function(number):number} x */
    const round =
        devicePixelRatio !== undefined
            ? x => Math.round(x * devicePixelRatio) / devicePixelRatio
            : x => x;

    /** @type {LocSize[]} */
    const results = [];

    let x = reverse ? Math.max(containerSize, totalPx) : 0;
    for (const size of items) {
        const advance =
            z(size.px) +
            (totalGrow ? (z(size.grow) / totalGrow) * remainingSpace : 0);

        if (reverse) {
            x -= advance;
        }

        results.push({ location: round(x) + offset, size: round(advance) });

        if (!reverse) {
            x += advance + spacing;
        } else {
            x -= spacing;
        }
    }

    return results;
}

/**
 * Returns the minimum size  (the sum of pixels sizes) for the flex items
 *
 * @param {SizeDef[]} items
 * @param {FlexOptions} [options]
 */
export function getMinimumSize(items, { spacing } = { spacing: 0 }) {
    let minimumSize = 0;
    for (const size of items) {
        minimumSize += z(size.px) + spacing;
    }
    return Math.max(0, minimumSize - spacing);
}

/**
 * Returns true if relative (stretching) elements are present
 * @param {SizeDef[]} items
 */
export function isStretching(items) {
    return items.some(size => size.grow);
}

export class FlexDimensions {
    /**
     *
     * @param {SizeDef} width
     * @param {SizeDef} height
     */
    constructor(width, height) {
        // TODO: Consider making immutable
        this.width = width;
        this.height = height;
    }

    /**
     * Adds padding to absolute (px) dimensions
     *
     * @param {import("./padding").default} padding
     */
    addPadding(padding) {
        this.width.px = (this.width.px || 0) + padding.width;
        this.height.px = (this.height.px || 0) + padding.height;

        return this;
    }
}

/**
 * Converts undefined/null to zero
 *
 * @param {number} value
 */
function z(value) {
    return value || 0;
}

/**
 *
 * @param {*} spec
 * @returns {spec is SizeDef}
 */
export function isSizeDef(spec) {
    return spec && (isNumber(spec.px) || isNumber(spec.grow));
}

/**
 *
 * @param {"container" | number | SizeDef | import("../../spec/view").Step} size
 * @returns {SizeDef}
 */
export function parseSizeDef(size) {
    if (isStepSize(size)) {
        throw new Error("parseSizeDef does not accept step-based sizes.");
    } else if (isSizeDef(size)) {
        return size;
    } else if (isNumber(size)) {
        return { px: size, grow: 0 };
    } else if (size === "container") {
        // https://vega.github.io/vega-lite/docs/size.html#specifying-responsive-width-and-height
        return { px: 0, grow: 1 };
    } else if (!size) {
        return { px: 0, grow: 1 };
    }

    throw new Error(`Invalid sizeDef: ${size}`);
}

// TODO: Find a better place for the following utilities: ////////////////////////////////////

/**
 * Interpolates between two LocSizes
 *
 * @param {LocSize} from
 * @param {LocSize} to
 * @param {function():number} ratio
 * @returns {LocSize}
 */
export function interpolateLocSizes(from, to, ratio) {
    return {
        get location() {
            const r = ratio();
            switch (r) {
                case 0:
                    return from.location;
                case 1:
                    return to.location;
                default:
                    return r * to.location + (1 - r) * from.location;
            }
        },

        get size() {
            const r = ratio();
            switch (r) {
                case 0:
                    return from.size;
                case 1:
                    return to.size;
                default:
                    return r * to.size + (1 - r) * from.size;
            }
        }
    };
}

/**
 * Wraps a LocSize and allows scrolling.
 *
 * @param {LocSize} locSize
 * @param {number | function():number} offset
 * @returns {LocSize}
 */
export function translateLocSize(locSize, offset) {
    const fn = isNumber(offset) ? () => offset : offset;
    return {
        get location() {
            return locSize.location + fn();
        },

        get size() {
            return locSize.size;
        }
    };
}

/**
 * Wraps a LocSize and allows scaling.
 *
 * @param {LocSize} locSize
 * @param {number | function():number} factor
 * @returns {LocSize}
 */
export function scaleLocSize(locSize, factor) {
    const fn = isNumber(factor) ? () => factor : factor;
    return {
        get location() {
            return locSize.location * fn();
        },

        get size() {
            return locSize.size * fn();
        }
    };
}

/**
 * @param {LocSize} locSize
 * @param {number} value
 */
export function locSizeEncloses(locSize, value) {
    return value >= locSize.location && value < locSize.location + locSize.size;
}
