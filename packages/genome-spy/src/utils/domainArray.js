import { shallowArrayEquals } from "./arrayUtils";

/**
 * @typedef {boolean | number | string} scalar
 */

export class DomainArray /** @type {Array<scalar>} */ extends Array {
    constructor() {
        super();
        /** @type {string} */
        this.type = undefined;
    }

    /**
     *
     * @param {scalar} value
     * @returns {DomainArray}
     */
    extend(value) {
        return this;
    }

    /**
     *
     * @param {Iterable<scalar>} values
     * @returns {DomainArray}
     */
    extendAll(values) {
        if (values instanceof DomainArray && values.type != this.type) {
            throw new Error(
                `Cannot combine different types of domains: ${this.type} and ${values.type}`
            );
        }

        for (const value of values) {
            this.extend(value);
        }

        return this;
    }
}

export class QuantitativeDomain extends DomainArray {
    constructor() {
        super();
        this.type = "quantitative";
    }

    /**
     *
     * @param {scalar} value
     * @returns {DomainArray}
     */
    extend(value) {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return this;
        }

        value = +value;

        if (this.length) {
            if (value < this[0]) {
                this[0] = value;
            } else if (value > this[1]) {
                this[1] = value;
            }
        } else {
            this.push(value);
            this.push(value);
        }

        return this;
    }
}

/**
 * Builder that tries to preserve the order
 */
export class OrdinalDomain extends DomainArray {
    constructor() {
        super();
        this.type = "ordinal";

        /** @type {Set<scalar>} */
        this.uniqueValues = new Set();
    }

    /**
     *
     * @param {scalar} value
     * @returns {DomainArray}
     */
    extend(value) {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return this;
        }

        if (!this.uniqueValues.has(value)) {
            this.uniqueValues.add(value);
            this.push(value);
        }

        return this;
    }
}

export class NominalDomain extends OrdinalDomain {
    constructor() {
        super();
        this.type = "nominal";
    }
}

export class PiecewiseDomain extends DomainArray {
    /**
     *
     * @param {number[]} initialDomain
     */
    constructor(initialDomain) {
        super();

        let sum = 0;
        for (let i = 1; i < initialDomain.length; i++) {
            sum += Math.sign(initialDomain[i] - initialDomain[i - 1]);
        }
        if (Math.abs(sum) != initialDomain.length - 1) {
            throw new Error(
                "Piecewise domain must be strictly increasing or decreasing: " +
                    JSON.stringify(initialDomain)
            );
        }

        initialDomain.forEach(x => this.push(x));
    }

    /**
     *
     * @param {scalar} value
     * @returns {DomainArray}
     */
    extend(value) {
        if (this.includes(value)) {
            return this;
        }

        throw new Error(
            "Piecewise domains are immutable and cannot be unioned!"
        );
    }
}

/**
 * @type Object.<string, typeof DomainArray>
 */
const domainTypes = {
    quantitative: QuantitativeDomain,
    locus: QuantitativeDomain,
    nominal: NominalDomain,
    ordinal: OrdinalDomain
};

/**
 *
 * @param {string} type
 * @param {scalar[]} [initialDomain]
 */
export default function createDomain(type, initialDomain) {
    if (type == "quantitative" && isPiecewiseArray(initialDomain)) {
        const b = new PiecewiseDomain(/** @type {number[]} */ (initialDomain));
        b.type = type;
        return b;
    } else if (domainTypes[type]) {
        const b = new domainTypes[type]();
        b.type = type;
        if (initialDomain) {
            b.extendAll(initialDomain);
        }
        return b;
    }

    throw new Error("Unknown type: " + type);
}

/**
 *
 * @param {array} array
 */
export function isDomainArray(array) {
    return array instanceof DomainArray;
}

/**
 * For unit tests
 *
 * @param {DomainArray} domainArray
 */
export function toRegularArray(domainArray) {
    return [...domainArray];
}

/**
 * @param {scalar[]} array
 */
function isPiecewiseArray(array) {
    return (
        array &&
        array.length > 0 &&
        array.length != 2 &&
        array.every(x => typeof x === "number")
    );
}
