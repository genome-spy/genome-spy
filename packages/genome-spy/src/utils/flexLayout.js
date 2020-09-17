import { isNumber } from "vega-util";

/**
 * @typedef {object} SizeDef Size definition inspired by CSS flexbox
 * @prop {number} [px] Size in pixels
 * @prop {number} [grow] Share of remaining space
 */

/**
 * Layout calculation inspired by flexbox. The elements may have an
 * absolute size (in pixels) and a growth component for filling the
 * remaining space.
 *
 * Read more at https://css-tricks.com/flex-grow-is-weird/
 *
 * TODO: Add some memoization to calculations
 *
 * @template I item
 */
export default class FlexLayout {
    /**
     *
     * @param {(any & Iterable<I>)} container
     * @param {function(I):SizeDef} itemSizeAccessor
     * @param {function():SizeDef} containerSizeAccessor
     */
    constructor(container, itemSizeAccessor, containerSizeAccessor) {
        this._container = container;
        this._itemSizeAccessor = itemSizeAccessor;
        this._containerSizeAccessor = containerSizeAccessor;
    }

    _getContainerSizePixels() {
        const size = this._containerSizeAccessor();
        if (isNumber(size.px)) {
            return size.px;
        }
        throw new Error("Container must have absolute size!"); // TODO: Compute
    }

    /**
     *
     * @param {I} item
     */
    getPixelSize(item) {
        let totalPx = 0;
        let totalGrow = 0;
        for (const child of this._container) {
            const size = this._itemSizeAccessor(child);
            totalPx += z(size.px);
            totalGrow += z(size.grow);
        }

        const remainingSpace = Math.max(
            0,
            this._getContainerSizePixels() - totalPx
        );

        let x = 0;
        for (const child of this._container) {
            const size = this._itemSizeAccessor(child);
            const advance =
                z(size.px) +
                (totalGrow ? (z(size.grow) / totalGrow) * remainingSpace : 0);

            if (child === item) {
                return [x, x + advance];
            }

            x += advance;
        }

        throw new Error("Not a child!");
    }

    /**
     *
     * @param {I} item
     */
    getNormalizedSize(item) {
        return this.getPixelSize(item).map(
            x => x / this._getContainerSizePixels()
        );
    }

    /**
     * Returns the minimum size (the sum of pixels sizes)
     */
    getMinimumSize() {
        let minimumSize = 0;
        for (const child of this._container) {
            const size = this._itemSizeAccessor(child);
            minimumSize += z(size.px);
        }
        return minimumSize;
    }

    /**
     * Returns true if relative (stretching) elements are present
     */
    isStretching() {
        for (const child of this._container) {
            const size = this._itemSizeAccessor(child);
            if (size.grow) {
                return true;
            }
        }
        return false;
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
 * @param {number | SizeDef} size
 * @returns {SizeDef}
 */
export function parseSizeDef(size) {
    if (isSizeDef(size)) {
        return size;
    } else if (isNumber(size)) {
        return { px: size, grow: 0 };
    } else if (!size) {
        return { px: 0, grow: 1 };
    }

    throw new Error(`Invalid sizeDef: ${size}`);
}
