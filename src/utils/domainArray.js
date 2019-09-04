
/**
 * @typedef {boolean | number | string} scalar
 */

export class DomainArray extends /** @type {Array<scalar>} */Array {
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
            throw new Error(`Cannot combine different types of domains: ${this.type} and ${values.type}`)
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
        if (value === null || value === undefined) {
            return this;
        }

        if (typeof value !== "number") {
            throw new Error("Quantitative domain accepts only numbers!")
        }

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
        if (value === null || value === undefined) {
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

/**
 * @type Object.<string, typeof DomainArray>
 */
const domainTypes = {
    "quantitative": QuantitativeDomain,
    "nominal": NominalDomain,
    "ordinal": OrdinalDomain
}

/**
 * 
 * @param {string} type 
 */
export default function createDomain(type) {
    if (domainTypes[type]) {
        const b = new domainTypes[type]();
        b.type = type;
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