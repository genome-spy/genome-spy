import { ATTRIBUTE_PREFIX } from "../scale/glslScaleGenerator";

/**
 * @typedef {Object} Converter
 * @prop {function(object):any} f
 * @prop {number} [numComponents]
 *
 */
export default class ArrayBuilder {
    // TODO: Support strided layout. May yield better performance or not. No consensus in literature.

    /**
     * @param {Record<string, Converter>} converters
     * @param {number} size Size if known, uses TypedArray
     */
    static create(converters, size = undefined) {
        const builder = new ArrayBuilder(size);

        for (const [attribute, props] of Object.entries(converters)) {
            builder.addConverter(
                ATTRIBUTE_PREFIX + attribute,
                props.numComponents || 1,
                props.f
            );
        }

        return builder;
    }

    /**
     *
     * @param {number} size Size if known, uses TypedArray
     */
    constructor(size) {
        this.size = size;

        /** @type {Object.<string, {data: number[] | Float32Array, numComponents: number, divisor?: number}>} */
        this.arrays = {};

        /** @type {(function():void)[]} */
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

        // Note: Writing to TypedArray appears to be super-slow on Chrome.
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

        /** @type {function():void} */
        let pusher;

        // TODO: Messy with all the typecasting. Create different createUpdater methods for regular and typed arrays

        if (numComponents == 1) {
            let i = 0;
            pusher = () => {
                array[i++] = /** @type {number} */ (pendingValue);
            };
        } else if (typed) {
            let i = 0;
            pusher = () =>
                /** @type {Float32Array} */ (array).set(
                    /** @type {Float32Array} */ (pendingValue),
                    i++ * numComponents
                );
        } else {
            let i = 0;
            pusher = () => {
                for (let j = 0; j < numComponents; j++) {
                    array[i++] = /** @type {number[]} */ (pendingValue)[j];
                }
            };
        }
        this.pushers.push(pusher);

        return updater;
    }

    _unrollPushAll() {
        let preps = "";
        let pushs = "";

        for (let i = 0; i < this.pushers.length; i++) {
            preps += `const p${i} = that.pushers[${i}];\n`;
            pushs += `p${i}()\n`;
        }

        // eslint-disable-next-line no-new-func
        const createUnrolled = new Function(
            "that",
            `${preps}

            return function unrolledPushAll() {
                ${pushs}
                that.vertexCount++;
            };
        `
        );

        this.pushAll = createUnrolled(this);
    }

    pushAll() {
        // Unrolling appears to give a 20% performance boost on Chrome but compiling the
        // dynamically generated code takes time and is thus not great for small dynamic data.
        const unroll = this.size > 100000;
        if (unroll) {
            this._unrollPushAll();
        } else {
            this.pushAll = () => {
                for (const pusher of this.pushers) {
                    pusher();
                }
                this.vertexCount++;
            };
        }

        this.pushAll();
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
        return Object.fromEntries(
            Object.entries(this.arrays).map(entry => [
                entry[0],
                { value: entry[1].data }
            ])
        );
    }
}
