import { isNumber, isString } from "vega-util";

/**
 * @typedef {object} SizingSpec
 * @prop {number} value
 * @prop {"%" | "px"} unit
 */

/**
 * Layout calculation inspired by flexbox
 */
export default class FlexLayout {
    constructor() {
        /** @type {SizingSpec[]} */
        this._items = [];

        /** @type {number} */
        this._containerSize = undefined;
    }

    /**
     *
     * @param {string | number | SizingSpec} size
     */
    append(size) {
        const spec = isSizingSpec(size) ? size : parseSize(size);

        const index = this._items.push(spec) - 1;

        const calculate = () => {
            let absoluteTotal = 0;
            let relativeTotal = 0;
            for (const item of this._items) {
                if (item.unit == "px") {
                    absoluteTotal += item.value;
                } else if (item.unit == "%") {
                    relativeTotal += item.value;
                }
            }
            if (!relativeTotal) {
                // Prevent division by zero
                relativeTotal = 1;
            }

            const leftForSharing = Math.max(
                0,
                this._containerSize - absoluteTotal
            );

            let x = 0;
            for (let i = 0; i < this._items.length; i++) {
                const item = this._items[i];
                const advance =
                    item.unit == "px"
                        ? item.value
                        : (item.value / relativeTotal) * leftForSharing;

                if (i == index) {
                    return [x, x + advance];
                }

                x += advance;
            }
        };

        return {
            getPixels: () => calculate(),
            getNormalized: () => calculate().map(x => x / this._containerSize),
            update: size => {
                throw new Error("Not implemented");
            },
            remove: () => {
                throw new Error("Not implemented");
            }
        };
    }

    /** @param {number} pixels */
    setContainerSize(pixels) {
        this._containerSize = pixels;
    }
}

/**
 *
 * @param {*} spec
 * @returns {spec is SizingSpec}
 */
function isSizingSpec(spec) {
    return isNumber(spec.value) && isString(spec.unit);
}

/**
 *
 * @param {string | number} size
 * @returns {SizingSpec}
 */
function parseSize(size) {
    if (isNumber(size)) {
        return { value: size, unit: "px" };
    } else if (isString(size)) {
        const match = size.match(/^(\d+(?:\.\d+)?)(px|%)$/);
        if (match) {
            return { value: parseFloat(match[1]), unit: match[2] };
        }
    }
    throw new Error(`Invalid size: ${size}`);
}
