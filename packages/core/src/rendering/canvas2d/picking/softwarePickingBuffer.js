const EMPTY_IDS = new Uint32Array(0);

/**
 * Integer ID storage for Canvas software picking.
 *
 * Dimensions are floored logical CSS pixels. The fractional right and bottom
 * fringes are intentionally outside the picking surface.
 */
export default class SoftwarePickingBuffer {
    #ids = EMPTY_IDS;

    width = 0;
    height = 0;

    /**
     * @param {number} [logicalWidth]
     * @param {number} [logicalHeight]
     */
    constructor(logicalWidth = 0, logicalHeight = 0) {
        this.resize(logicalWidth, logicalHeight);
    }

    /** @returns {Uint32Array} */
    get ids() {
        return this.#ids;
    }

    /**
     * @param {number} logicalWidth
     * @param {number} logicalHeight
     * @returns {boolean} Whether new storage was allocated.
     */
    resize(logicalWidth, logicalHeight) {
        const width = floorDimension(logicalWidth, "width");
        const height = floorDimension(logicalHeight, "height");
        if (width == this.width && height == this.height) {
            return false;
        }

        const length = width * height;
        if (!Number.isSafeInteger(length)) {
            throw new RangeError("Software picking buffer is too large.");
        }

        this.width = width;
        this.height = height;
        this.#ids = length ? new Uint32Array(length) : EMPTY_IDS;
        return true;
    }

    clear() {
        this.#ids.fill(0);
    }

    /**
     * @param {number} x Logical pointer coordinate.
     * @param {number} y Logical pointer coordinate.
     * @returns {number}
     */
    read(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return 0;
        }
        const pixelX = Math.floor(x);
        const pixelY = Math.floor(y);
        if (
            pixelX < 0 ||
            pixelY < 0 ||
            pixelX >= this.width ||
            pixelY >= this.height
        ) {
            return 0;
        }
        return this.#ids[pixelY * this.width + pixelX];
    }

    dispose() {
        this.width = 0;
        this.height = 0;
        this.#ids = EMPTY_IDS;
    }
}

/**
 * @param {number} value
 * @param {string} name
 * @returns {number}
 */
function floorDimension(value, name) {
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(
            `Software picking buffer ${name} must be a finite nonnegative number.`
        );
    }
    return Math.floor(value);
}
