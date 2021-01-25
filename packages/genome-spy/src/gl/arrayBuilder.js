import { isNumber } from "vega-util";
import { ATTRIBUTE_PREFIX } from "../scale/glslScaleGenerator";

/**
 * @typedef {Object} ConverterMetadata
 *      A function that extracts a raw attribute from a datum (optionally) converts
 *      it to floats or float vectors that can be stored in GPU buffers.
 * @prop {function(object):any} f The converter
 * @prop {number[]} [arrayReference] An optimization for fp64 mainly
 * @prop {number} [numComponents]
 */
export default class ArrayBuilder {
    // TODO: Support strided layout. May yield better performance or not. No consensus in literature.

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

        /** @type {(function(any):void)[]} */
        this.dataUpdaters = [];

        this.vertexCount = 0;
    }

    /**
     *
     * @param {string} attribute
     * @param {ConverterMetadata} metadata
     */
    addConverter(attribute, metadata) {
        const updater = this.createUpdater(
            ATTRIBUTE_PREFIX + attribute,
            metadata.numComponents || 1,
            metadata.arrayReference
        );
        const f = metadata.f;
        this.dataUpdaters.push(
            metadata.arrayReference ? d => updater(f(d)) : d => updater(f(d))
        );
    }

    /**
     *
     * @param {string} attributeName
     * @param {number} numComponents
     * @param {number[]} [arrayReference]
     * @return {function(number|number[])}
     */
    createUpdater(attributeName, numComponents, arrayReference) {
        /** @type {number | number[] | Float32Array} */
        let pendingValue = arrayReference ? arrayReference : undefined;

        const typed = isNumber(this.size);

        // TODO: Optimize!
        // Having an untyped array here apparently causes V8 to ruin (deoptimize) the code,
        // which leads to a massive (like 5x) performance loss on all subsequent
        // ArrayBuilder instances.

        /** @type {number[] | Float32Array} */
        const array = typed ? new Float32Array(this.size * numComponents) : [];

        this.arrays[attributeName] = {
            data: array,
            numComponents: numComponents
        };

        /** @type {function(number):void} value */
        const updater = arrayReference
            ? value => {
                  // Nop. Pending value is updated through the array reference.
              }
            : value => {
                  pendingValue = value;
              };

        /** @type {function():void} */
        let pusher;
        let i = 0;

        switch (numComponents) {
            case 1:
                pusher = () => {
                    array[i++] = /** @type {number} */ (pendingValue);
                };
                break;
            case 2:
                pusher = () => {
                    array[i++] = /** @type {number[]} */ (pendingValue)[0];
                    array[i++] = /** @type {number[]} */ (pendingValue)[1];
                };
                break;
            case 3:
                pusher = () => {
                    array[i++] = /** @type {number[]} */ (pendingValue)[0];
                    array[i++] = /** @type {number[]} */ (pendingValue)[1];
                    array[i++] = /** @type {number[]} */ (pendingValue)[2];
                };
                break;
            case 4:
                pusher = () => {
                    array[i++] = /** @type {number[]} */ (pendingValue)[0];
                    array[i++] = /** @type {number[]} */ (pendingValue)[1];
                    array[i++] = /** @type {number[]} */ (pendingValue)[2];
                    array[i++] = /** @type {number[]} */ (pendingValue)[3];
                };
                break;
            default:
                throw new Error("Invalid numComponents: " + numComponents);
        }

        this.pushers.push(pusher);

        return updater;
    }

    _unrollPushAll() {
        let preps = "";
        let pushs = "";

        for (let i = 0; i < this.pushers.length; i++) {
            preps += `const p${i} = that.pushers[${i}];\n`;
            pushs += `p${i}();\n`;
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
        for (const updater of this.dataUpdaters) {
            updater(datum);
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
}
