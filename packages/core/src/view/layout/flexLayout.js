import { isNumber } from "vega-util";
import { isStepSize } from "../view.js";

/**
 *
 * Layout calculation inspired by flexbox. The elements may have an
 * absolute size (in pixels) and a growth component for filling the
 * remaining space. Spacing around zero-sized items are collapsed.
 *
 * Read more at https://css-tricks.com/flex-grow-is-weird/
 *
 * @typedef {object} SizeDef Size definition inspired by CSS flexbox
 * @prop {number} [px] Size in pixels
 * @prop {number} [grow] Share of remaining space
 * @prop {number} [minPx] Minimum size in pixels
 * @prop {number} [maxPx] Maximum size in pixels
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

    const itemSizes = resolveItemSizes(items, containerSize, spacing);

    let totalSize = 0;
    let nonZeroCount = 0;
    for (let i = 0; i < items.length; i++) {
        totalSize += itemSizes[i];
        if (!isZeroSizeDef(items[i])) {
            nonZeroCount++;
        }
    }
    const totalPx = totalSize + Math.max(0, nonZeroCount - 1) * spacing;

    /** @type {function(number):number} x */
    const round =
        devicePixelRatio !== undefined
            ? (x) => Math.round(x * devicePixelRatio) / devicePixelRatio
            : (x) => x;

    /**
     * Buffer zero-sized items so that their locations can be spread evenly.
     * They can then be interpolated nicely.
     */
    let zeroCount = 0;

    /** @type {LocSize[]} */
    const results = [];

    /**
     * Spread evenly
     *
     * @param {boolean} inMiddle
     */
    const flushZeroBuffer = (inMiddle) => {
        const n = zeroCount;
        if (!n) {
            return;
        }

        const s = (inMiddle ? spacing : 0) * (reverse ? -1 : 1);

        x -= s;
        for (let i = 0; i < n; i++) {
            results.push({
                location: x + ((i + 1) / (n + 1)) * s,
                size: 0,
            });
        }
        x += s;

        zeroCount = 0;
    };

    let x = reverse ? Math.max(containerSize, totalPx) : 0 + offset;

    // Handle a special case
    if (items.length == 1 && isZeroSizeDef(items[0])) {
        return [{ location: x, size: 0 }];
    }

    for (let i = 0; i < items.length; i++) {
        const size = items[i];

        if (isZeroSizeDef(size)) {
            zeroCount++;
        } else {
            flushZeroBuffer(results.length > 0);

            const advance = itemSizes[i];

            if (reverse) {
                x -= advance;
            }

            results.push({ location: round(x), size: round(advance) });

            if (!reverse) {
                x += advance + spacing;
            } else {
                x -= spacing;
            }
        }
    }

    // Remove the last gap
    x += reverse ? spacing : -spacing;

    flushZeroBuffer(false);

    return results;
}

/**
 * Returns the minimum size  (the sum of pixels sizes) for the flex items
 *
 * @param {Iterable<SizeDef>} items
 * @param {FlexOptions} [options]
 */
export function getMinimumSize(items, { spacing } = { spacing: 0 }) {
    let minimumSize = 0;
    for (const size of items) {
        minimumSize +=
            clampSize(z(size.px), size) + (isZeroSizeDef(size) ? 0 : spacing);
    }
    return Math.max(0, minimumSize - spacing);
}

/**
 * @param {Iterable<SizeDef>} items
 * @returns {SizeDef}
 */
export function getLargestSize(items) {
    let px = 0;
    let grow = 0;
    let minPx = 0;
    let maxPx = undefined;
    for (const s of items) {
        px = Math.max(px, s.px ?? 0);
        grow = Math.max(grow, s.grow ?? 0);
        minPx = Math.max(minPx, s.minPx ?? 0);
        if (s.maxPx !== undefined) {
            maxPx = maxPx === undefined ? s.maxPx : Math.max(maxPx, s.maxPx);
        }
    }

    return createSizeDef({ px, grow, minPx, maxPx });
}

/**
 * Returns true if relative (stretching) elements are present
 * @param {SizeDef[]} items
 */
export function isStretching(items) {
    return items.some((size) => size.grow);
}

/**
 *
 * @param {SizeDef[]} sizeDefs
 */
export function sumSizeDefs(sizeDefs) {
    const sum = { px: 0, grow: 0, minPx: 0, maxPx: 0 };
    let hasMaxSize = true;
    for (const size of sizeDefs) {
        sum.px += z(size.px);
        sum.grow += z(size.grow);
        sum.minPx += size.minPx ?? 0;
        if (size.maxPx === undefined) {
            hasMaxSize = false;
        } else {
            sum.maxPx += size.maxPx;
        }
    }
    if (!hasMaxSize) {
        delete sum.maxPx;
    }
    return createSizeDef(sum);
}

export class FlexDimensions {
    /**
     *
     * @param {SizeDef} width
     * @param {SizeDef} height
     */
    constructor(width, height) {
        // TODO: Consider making immutable
        /** @readonly */
        this.width = width;
        /** @readonly */
        this.height = height;
    }

    /**
     * Adds padding to absolute (px) dimensions
     *
     * @param {import("./padding.js").default} padding
     */
    addPadding(padding) {
        return this.#addPx(padding.width, padding.height);
    }

    /**
     * Subtracts padding from absolute (px) dimensions
     *
     * @param {import("./padding.js").default} padding
     */
    subtractPadding(padding) {
        return this.#addPx(-padding.width, -padding.height);
    }

    /**
     * @param {number} width
     * @param {number} height
     */
    #addPx(width, height) {
        return new FlexDimensions(
            addPxToSizeDef(this.width, width),
            addPxToSizeDef(this.height, height)
        );
    }

    /**
     * Returns true if either of the dimensions is growing
     *
     * @returns {boolean}
     */
    isGrowing() {
        return !!(this.width.grow || this.height.grow);
    }
}

/**
 * A sizedef that takes no space at all.
 *
 * @type {SizeDef}
 */
export const ZERO_SIZEDEF = Object.freeze({
    px: 0,
    grow: 0,
});

export const ZERO_FLEXDIMENSIONS = new FlexDimensions(
    ZERO_SIZEDEF,
    ZERO_SIZEDEF
);

/**
 * Is the sizeDef taking no space at all
 *
 * @param {SizeDef} sizeDef
 */
export function isZeroSizeDef(sizeDef) {
    return !sizeDef.px && !sizeDef.grow && !sizeDef.minPx;
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
    return (
        spec &&
        (isNumber(spec.px) ||
            isNumber(spec.grow) ||
            isNumber(spec.minPx) ||
            isNumber(spec.maxPx))
    );
}

/**
 *
 * @param {"container" | number | SizeDef | import("../../spec/view.js").Step} size
 * @returns {SizeDef}
 */
export function parseSizeDef(size) {
    if (isStepSize(size)) {
        throw new Error("parseSizeDef does not accept step-based sizes.");
    } else if (isSizeDef(size)) {
        validateSizeDef(size);
        return createSizeDef(size);
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

/**
 * Resolves final item sizes using GenomeSpy's simplified flex model. It is
 * inspired by CSS Flexbox §9.7 "Resolving Flexible Lengths", but only covers
 * grow-based free-space distribution and min/max constraints.
 *
 * https://www.w3.org/TR/css-flexbox-1/#resolve-flexible-lengths
 *
 * @param {SizeDef[]} items
 * @param {number} containerSize
 * @param {number} spacing
 * @returns {number[]}
 */
function resolveItemSizes(items, containerSize, spacing) {
    let hasConstraints = false;
    for (const item of items) {
        validateSizeDef(item);
        hasConstraints ||= hasSizeConstraints(item);
    }

    if (!hasConstraints) {
        return resolveUnconstrainedItemSizes(items, containerSize, spacing);
    }

    /** @type {number[]} */
    const sizes = Array(items.length).fill(0);
    /** @type {number[]} */
    const flexIndices = [];
    for (let i = 0; i < items.length; i++) {
        if (!isZeroSizeDef(items[i])) {
            flexIndices.push(i);
        }
    }

    const gapSize = Math.max(0, flexIndices.length - 1) * spacing;
    const availableSize = Math.max(0, containerSize - gapSize);

    // Fixed-size items do not participate in flex growth, but min/max still
    // clamp them just like flex items with flex-grow: 0.
    /** @type {Set<number>} */
    const frozen = new Set();

    for (const index of flexIndices) {
        const item = items[index];
        if (!z(item.grow)) {
            sizes[index] = clampSize(z(item.px), item);
            frozen.add(index);
        }
    }

    while (true) {
        let totalBase = 0;
        let totalGrow = 0;
        let frozenSize = 0;

        // Frozen items have their final size. Unfrozen items still contribute
        // their base px size and grow factor to the next free-space pass.
        for (const index of flexIndices) {
            if (frozen.has(index)) {
                frozenSize += sizes[index];
            } else {
                totalBase += z(items[index].px);
                totalGrow += z(items[index].grow);
            }
        }

        if (!totalGrow) {
            for (const index of flexIndices) {
                if (!frozen.has(index)) {
                    sizes[index] = clampSize(z(items[index].px), items[index]);
                    frozen.add(index);
                }
            }
            break;
        }

        const remainingSize = Math.max(
            0,
            availableSize - frozenSize - totalBase
        );
        let totalViolation = 0;
        /** @type {number[]} */
        const minViolations = [];
        /** @type {number[]} */
        const maxViolations = [];

        // CSS Flexbox §9.7 first clamps every unfrozen item, then uses the
        // aggregate violation to decide which side freezes. We follow that
        // part so mixed min/max violations converge the same way.
        for (const index of flexIndices) {
            if (frozen.has(index)) {
                continue;
            }

            const item = items[index];
            const targetSize =
                z(item.px) + (z(item.grow) / totalGrow) * remainingSize;
            const clampedSize = clampSize(targetSize, item);
            sizes[index] = clampedSize;

            const violation = clampedSize - targetSize;
            totalViolation += violation;
            if (violation > 0) {
                minViolations.push(index);
            } else if (violation < 0) {
                maxViolations.push(index);
            }
        }

        if (!minViolations.length && !maxViolations.length) {
            break;
        } else if (totalViolation > 0) {
            for (const index of minViolations) {
                frozen.add(index);
            }
        } else if (totalViolation < 0) {
            for (const index of maxViolations) {
                frozen.add(index);
            }
        } else {
            for (const index of flexIndices) {
                frozen.add(index);
            }
        }
    }

    return sizes;
}

/**
 * Fast path for the common SizeDef shape that only uses px and grow.
 *
 * @param {SizeDef[]} items
 * @param {number} containerSize
 * @param {number} spacing
 * @returns {number[]}
 */
function resolveUnconstrainedItemSizes(items, containerSize, spacing) {
    let totalPx = 0;
    let totalGrow = 0;

    for (const size of items) {
        totalPx += z(size.px) + (isZeroSizeDef(size) ? 0 : spacing);
        totalGrow += z(size.grow);
    }
    totalPx -= spacing;

    const remainingSpace = Math.max(0, containerSize - totalPx);

    /** @type {number[]} */
    const sizes = Array(items.length);
    for (let i = 0; i < items.length; i++) {
        const size = items[i];
        sizes[i] = isZeroSizeDef(size)
            ? 0
            : z(size.px) +
              (totalGrow ? (z(size.grow) / totalGrow) * remainingSpace : 0);
    }

    return sizes;
}

/**
 * @param {SizeDef} size
 */
function validateSizeDef(size) {
    if (
        size.minPx !== undefined &&
        size.maxPx !== undefined &&
        size.minPx > size.maxPx
    ) {
        throw new Error("SizeDef minPx cannot be greater than maxPx.");
    }
}

/**
 * @param {number} size
 * @param {SizeDef} sizeDef
 */
function clampSize(size, sizeDef) {
    return Math.min(
        Math.max(size, sizeDef.minPx ?? 0),
        sizeDef.maxPx ?? Infinity
    );
}

/**
 * @param {SizeDef} sizeDef
 */
function hasSizeConstraints(sizeDef) {
    return sizeDef.minPx !== undefined || sizeDef.maxPx !== undefined;
}

/**
 * @param {SizeDef} sizeDef
 * @param {number} px
 * @returns {SizeDef}
 */
function addPxToSizeDef(sizeDef, px) {
    return createSizeDef({
        px: (sizeDef.px ?? 0) + px,
        grow: sizeDef.grow,
        minPx:
            sizeDef.minPx === undefined
                ? undefined
                : Math.max(0, sizeDef.minPx + px),
        maxPx:
            sizeDef.maxPx === undefined
                ? undefined
                : Math.max(0, sizeDef.maxPx + px),
    });
}

/**
 * @param {SizeDef} sizeDef
 * @returns {SizeDef}
 */
function createSizeDef(sizeDef) {
    /** @type {SizeDef} */
    const result = {};
    const hasPx = sizeDef.px !== undefined;
    const hasGrow = sizeDef.grow !== undefined;
    const hasConstraints = hasSizeConstraints(sizeDef);

    if (sizeDef.px) {
        result.px = sizeDef.px;
    } else if (sizeDef.px === 0) {
        result.px = 0;
    }

    if (sizeDef.grow) {
        result.grow = sizeDef.grow;
    } else if (sizeDef.grow === 0) {
        result.grow = 0;
    } else if (!hasPx && !hasGrow && hasConstraints) {
        result.grow = 1;
    }

    if (sizeDef.minPx) {
        result.minPx = sizeDef.minPx;
    }

    if (sizeDef.maxPx !== undefined) {
        result.maxPx = sizeDef.maxPx;
    }

    return result;
}
