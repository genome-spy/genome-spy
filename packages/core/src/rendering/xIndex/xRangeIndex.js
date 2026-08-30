import clamp from "../../utils/clamp.js";

/**
 * Builds a binned index from sorted data intervals to contiguous renderer-native
 * integer ranges. Invalid input disables the completed index.
 */
export class XRangeIndexBuilder {
    /**
     * @param {readonly [number, number]} domain
     * @param {number} binCount
     */
    constructor(domain, binCount) {
        this.domain = domain;
        this.binCount = binCount;
        this.valid =
            Number.isFinite(domain[0]) &&
            Number.isFinite(domain[1]) &&
            domain[1] > domain[0] &&
            Number.isInteger(binCount) &&
            binCount > 0;

        /** @type {number[]} */
        this.startIndices = new Array(this.valid ? binCount : 0).fill(Infinity);

        /** @type {number[]} */
        this.endIndices = new Array(this.valid ? binCount : 0).fill(-Infinity);

        this.lastX = -Infinity;
        this.lastNativeEnd = -1;
        this.firstNativeStart = -1;
    }

    /**
     * Adds one half-open data interval and its half-open native range.
     * Point data uses the same value for x and x2.
     *
     * @param {number} x
     * @param {number} x2
     * @param {number} nativeStart
     * @param {number} nativeEnd
     */
    add(x, x2, nativeStart, nativeEnd) {
        if (!this.valid || nativeStart === nativeEnd) {
            return;
        }

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(x2) ||
            x2 < x ||
            !Number.isInteger(nativeStart) ||
            !Number.isInteger(nativeEnd) ||
            nativeStart < 0 ||
            nativeEnd < nativeStart ||
            x < this.lastX ||
            nativeStart < this.lastNativeEnd
        ) {
            this.valid = false;
            return;
        }

        if (this.firstNativeStart < 0) {
            this.firstNativeStart = nativeStart;
        }
        this.lastX = x;
        this.lastNativeEnd = nativeEnd;

        const startBin = this.#getBin(x, false);
        const endBin = x === x2 ? startBin : this.#getBin(x2, true);
        for (let bin = startBin; bin <= endBin; bin++) {
            this.startIndices[bin] = Math.min(
                this.startIndices[bin],
                nativeStart
            );
            this.endIndices[bin] = Math.max(this.endIndices[bin], nativeEnd);
        }
    }

    /**
     * @returns {XRangeIndex | undefined}
     */
    finish() {
        if (!this.valid || this.firstNativeStart < 0) {
            return undefined;
        }

        let previousEnd = this.firstNativeStart;
        for (let i = 0; i < this.binCount; i++) {
            const end = this.endIndices[i];
            if (end > previousEnd) {
                previousEnd = end;
            }
            this.endIndices[i] = previousEnd;
        }

        let nextStart = this.lastNativeEnd;
        for (let i = this.binCount - 1; i >= 0; i--) {
            const start = this.startIndices[i];
            if (start < nextStart) {
                nextStart = start;
            }
            this.startIndices[i] = nextStart;
        }

        return new XRangeIndex(
            this.domain,
            this.startIndices,
            this.endIndices,
            this.firstNativeStart,
            this.lastNativeEnd
        );
    }

    /**
     * @param {number} value
     * @param {boolean} isEnd
     */
    #getBin(value, isEnd) {
        const [domainStart, domainEnd] = this.domain;
        const unfloored =
            ((value - domainStart) * this.binCount) / (domainEnd - domainStart);
        const floored = Math.floor(unfloored);
        return clamp(
            isEnd && floored === unfloored ? floored - 1 : floored,
            0,
            this.binCount - 1
        );
    }
}

export class XRangeIndex {
    /**
     * @param {readonly [number, number]} domain
     * @param {readonly number[]} startIndices
     * @param {readonly number[]} endIndices
     * @param {number} nativeStart
     * @param {number} nativeEnd
     */
    constructor(domain, startIndices, endIndices, nativeStart, nativeEnd) {
        this.domain = domain;
        this.startIndices = startIndices;
        this.endIndices = endIndices;
        this.nativeStart = nativeStart;
        this.nativeEnd = nativeEnd;
    }

    /**
     * Writes a conservative half-open native range into reusable storage.
     * Invalid queries fail closed to the complete indexed range.
     *
     * @param {number} queryStart
     * @param {number} queryEnd
     * @param {[number, number]} target
     * @returns {[number, number]}
     */
    query(queryStart, queryEnd, target) {
        if (
            !Number.isFinite(queryStart) ||
            !Number.isFinite(queryEnd) ||
            queryEnd < queryStart
        ) {
            target[0] = this.nativeStart;
            target[1] = this.nativeEnd;
            return target;
        }

        const startBin = this.#getBin(queryStart, false);
        const endBin = this.#getBin(queryEnd, true);
        const start = this.startIndices[startBin];
        target[0] = start;
        target[1] = Math.max(start, this.endIndices[endBin]);
        return target;
    }

    /**
     * @param {number} value
     * @param {boolean} isEnd
     */
    #getBin(value, isEnd) {
        const [domainStart, domainEnd] = this.domain;
        const binCount = this.startIndices.length;
        const unfloored =
            ((value - domainStart) * binCount) / (domainEnd - domainStart);
        const floored = Math.floor(unfloored);
        return clamp(
            isEnd && floored === unfloored ? floored - 1 : floored,
            0,
            binCount - 1
        );
    }
}
