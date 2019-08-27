import { array } from 'vega-util';

/**
 * @typedef {(number|string)} scalar
 */

/**
 * A discrete domain
 */
export default class DiscreteDomain {
    /**
     * 
     * @param {scalar[] | Set} [values]
     */
    constructor(values) {
        /** @type {scalar[]} */
        this.values = [];
        if (values instanceof Set) {
            this.values = [...values];
        } else {
            this.add(values);
        }
    }

    /**
     * 
     * @param {scalar | scalar[]} [values]
     */
    add(values) {
        if (!values) {
            return;
        }

        let added = 0;
        // Preserve order of the existing elements

        const valuesArray = array(values);
        for (const value of valuesArray) {
            if (!this.values.includes(value)) {
                this.values.push(value);
                added++;
            }
        }

        return added;
    }

    /**
     * Returns the underlying array, not a copy.
     */
    toArray() {
        return this.values;
    }
}