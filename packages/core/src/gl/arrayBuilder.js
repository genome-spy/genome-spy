import { isNumber } from "vega-util";
import { ATTRIBUTE_PREFIX } from "./glslScaleGenerator.js";

/** Unrolling appears to give a 20% performance boost on Chrome but compiling the
 * dynamically generated code takes time and is thus not great for small dynamic data.
 * Unrolling probably allows the JS engine to inline pusher calls.
 */
const UNROLL_LIMIT = 10000;

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
            metadata.arrayReference
                ? (d) => updater(f(d))
                : (d) => updater(f(d))
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
        if (!isNumber(this.size)) {
            throw new Error("The number of vertices must be defined!");
        }

        /** @type {function():void} */
        let pusher;
        let updater;
        let i = 0;

        const array = new Float32Array(this.size * numComponents);

        this.arrays[attributeName] = {
            data: array,
            numComponents: numComponents,
        };

        if (numComponents == 1) {
            let pendingValue = 0;

            /** @param {number} value */
            const valueUpdater = (value) => {
                pendingValue = +value;
            };

            pusher = () => {
                array[i++] = pendingValue;
            };
            updater = valueUpdater;
        } else {
            let pendingArray = arrayReference ?? [0];

            /** @type {function(number[]):void} value */
            const arrayUpdater = arrayReference
                ? (value) => {
                      // Nop. Pending value is updated through the array reference.
                  }
                : (value) => {
                      pendingArray = value;
                  };

            switch (numComponents) {
                case 1:
                    break;
                case 2:
                    pusher = () => {
                        array[i++] = pendingArray[0];
                        array[i++] = pendingArray[1];
                    };
                    updater = arrayUpdater;
                    break;
                case 3:
                    pusher = () => {
                        array[i++] = pendingArray[0];
                        array[i++] = pendingArray[1];
                        array[i++] = pendingArray[2];
                    };
                    updater = arrayUpdater;
                    break;
                case 4:
                    pusher = () => {
                        array[i++] = pendingArray[0];
                        array[i++] = pendingArray[1];
                        array[i++] = pendingArray[2];
                        array[i++] = pendingArray[3];
                    };
                    updater = arrayUpdater;
                    break;
                default:
                    throw new Error("Invalid numComponents: " + numComponents);
            }
        }

        this.pushers.push(pusher);

        return updater;
    }

    pushAll() {
        if (this.size > UNROLL_LIMIT) {
            const preps = this.pushers
                .map((_v, i) => `const p${i} = that.pushers[${i}];`)
                .join("\n");
            const pushs = this.pushers.map((_v, i) => `  p${i}();`).join("\n");

            // eslint-disable-next-line no-new-func
            this.pushAll = new Function(
                "that",
                `${preps}
return function unrolledPushAll() {
${pushs}
  that.vertexCount++;
};`
            )(this);
        } else {
            this.pushAll = () => {
                for (let i = 0; i < this.pushers.length; i++) {
                    this.pushers[i]();
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
        if (this.size > UNROLL_LIMIT) {
            const preps = this.dataUpdaters
                .map((_v, i) => `const u${i} = that.dataUpdaters[${i}];`)
                .join("\n");
            const updates = this.dataUpdaters
                .map((_v, i) => `  u${i}(datum);`)
                .join("\n");

            // eslint-disable-next-line no-new-func
            this.updateFromDatum = new Function(
                "that",
                "datum",
                `${preps}
return function unrolledUpdateFromDatum(datum) {
${updates}
};`
            )(this);
        } else {
            this.updateFromDatum = (datum) => {
                for (let i = 0; i < this.dataUpdaters.length; i++) {
                    this.dataUpdaters[i](datum);
                }
            };
        }

        this.updateFromDatum(datum);
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
