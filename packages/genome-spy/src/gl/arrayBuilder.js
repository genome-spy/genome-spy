import fromEntries from "fromentries";

/**
 * @typedef {Object} Converter
 * @prop {function(object)} f
 * @prop {number} [numComponents]
 *
 */
export default class ArrayBuilder {
    // TODO: Support strided layout. May yield better performance or not. No consensus in literature.

    /**
     * @param {Object.<string, import("./arraybuilder").Converter>} converters
     * @param {string[]} attributes Which attributes to include
     * @param {number} size Size if known, uses TypedArray
     */
    static create(converters, attributes, size = undefined) {
        const builder = new ArrayBuilder(size);

        Object.entries(converters)
            .filter(entry => attributes.includes(entry[0]))
            .forEach(entry =>
                builder.addConverter(
                    entry[0],
                    entry[1].numComponents || 1,
                    entry[1].f
                )
            );

        return builder;
    }

    /**
     *
     * @param {number} size Size if known, uses TypedArray
     */
    constructor(size) {
        this.size = size;

        /** @type {Object.<string, {data: number[] | Float32Array, numComponents: number, divisor: ?number}>} */
        this.arrays = {};

        /** @type {function[]} */
        this.pushers = [];

        /** @type {function[]} */
        this.converters = [];

        this.vertexCount = 0;
    }

    /**
     *
     * @param {string} attributeName
     * @param {number} numComponents
     * @param {function} converter
     */
    addConverter(attributeName, numComponents, converter) {
        const updater = this.createUpdater(attributeName, numComponents);
        this.converters.push(d => updater(converter(d)));
    }

    /**
     *
     * @param {string} attributeName
     * @param {number} numComponents
     * @return {function(number|number[])}
     */
    createUpdater(attributeName, numComponents) {
        /** @type {number | number[] | Float32Array} */
        let pendingValue;

        const typed = !!this.size;

        /** @type {number[] | Float32Array} */
        const array = typed ? new Float32Array(this.size * numComponents) : [];

        this.arrays[attributeName] = {
            data: array,
            numComponents: numComponents
        };

        /** @param {number} value */
        const updater = function(value) {
            pendingValue = value;
        };

        let pusher;

        // TODO: Messy with all the typecasting. Create different createUpdater methods for regular and typed arrays

        if (numComponents == 1) {
            pusher = () => {
                array[this.vertexCount] = /** @type {number} */ (pendingValue);
            };
        } else if (typed) {
            pusher = () =>
                /** @type {Float32Array} */ (array).set(
                    /** @type {Float32Array} */ (pendingValue),
                    this.vertexCount * numComponents
                );
        } else {
            pusher = () => {
                const offset = this.vertexCount * numComponents;
                for (let i = 0; i < numComponents; i++) {
                    array[offset + i] =
                        /** @type {number[]} */ (pendingValue)[i];
                }
            };
        }
        this.pushers.push(pusher);
        return updater;
    }

    pushAll() {
        for (const pusher of this.pushers) {
            pusher();
        }
        this.vertexCount++;
    }

    /**
     *
     * @param {object} datum
     */
    updateFromDatum(datum) {
        for (const converter of this.converters) {
            converter(datum);
        }
    }

    /**
     *
     * @param {object} datum
     */
    pushFromDatum(datum) {
        this.updateFromDatum(datum);
        this.pushAll();
    }

    /**
     * Creates TWGL constant arrays
     */
    toValues() {
        return fromEntries(
            Object.entries(this.arrays).map(entry => [
                entry[0],
                { value: entry[1].data }
            ])
        );
    }
}
