import { ATTRIBUTE_PREFIX } from "../scale/glslScaleGenerator";

/**
 * @typedef {Object} Converter
 * @prop {function(object)} f
 * @prop {number} [numComponents]
 * @prop {boolean} [raw]
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
            .forEach(([attribute, props]) => {
                if (!props) {
                    throw new Error("Bug!");
                }
                return builder.addConverter(
                    !props.raw ? attribute : ATTRIBUTE_PREFIX + attribute,
                    props.numComponents || 1,
                    props.f
                );
            });

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

        /** @type {(function(number):void)[]} */
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
        if (!converter) {
            throw new Error("Bug: no converter for " + attributeName + "!");
        }
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

        /** @type {function(number):void} */
        let pusher;

        // TODO: Messy with all the typecasting. Create different createUpdater methods for regular and typed arrays

        if (numComponents == 1) {
            pusher = i => {
                array[i] = /** @type {number} */ (pendingValue);
            };
        } else if (typed) {
            pusher = i =>
                /** @type {Float32Array} */ (array).set(
                    /** @type {Float32Array} */ (pendingValue),
                    i * numComponents
                );
        } else {
            pusher = i => {
                const offset = i * numComponents;
                for (let j = 0; j < numComponents; j++) {
                    array[offset + j] =
                        /** @type {number[]} */ (pendingValue)[j];
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
            pushs += `p${i}(i)\n`;
        }

        // eslint-disable-next-line no-new-func
        const createUnrolled = new Function(
            "that",
            `${preps}

            return function unrolledPushAll() {
                const i = that.vertexCount++;
                ${pushs}
            };
        `
        );

        this.pushAll = createUnrolled(this);
    }

    pushAll() {
        const unroll = true;
        if (unroll) {
            // Unrolling appears to give a 15% performance boost on Chrome.
            this._unrollPushAll();
        } else {
            this.pushAll = () => {
                const i = this.vertexCount++;
                for (const pusher of this.pushers) {
                    pusher(i);
                }
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
