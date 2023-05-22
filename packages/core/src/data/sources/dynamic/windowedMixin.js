/** @typedef {new (...args: any[]) => any} Constructor */

import { shallowArrayEquals } from "../../../utils/arrayUtils";

/**
 * Utils for handling data sources that are fetched in chunks.
 *
 * @template {!Constructor} T
 * @param {T} superclass - The class to extend
 */
export default function windowedMixin(superclass) {
    return class FormControl extends superclass {
        /**
         * @type {number[]}
         */
        lastQuantizedInterval = [0, 0];

        /**
         * Returns three consecutive windows. The idea is to immediately have some data
         * to show to the user when they pan the view.
         *
         * @param {number[]} interval
         * @param {number} windowSize
         * @returns
         */
        quantizeInterval(interval, windowSize) {
            return [
                Math.max(
                    Math.floor(interval[0] / windowSize - 1) * windowSize,
                    0
                ),
                Math.min(
                    Math.ceil(interval[1] / windowSize + 1) * windowSize,
                    this.genome.totalSize
                ),
            ];
        }

        /**
         *
         * @param {number[]} interval
         * @returns
         */
        checkAndUpdateLastInterval(interval) {
            if (shallowArrayEquals(this.lastQuantizedInterval, interval)) {
                return false;
            }

            this.lastQuantizedInterval = interval;
            return true;
        }
    };
}
