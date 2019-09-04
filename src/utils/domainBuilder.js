
/**
 * @typedef {boolean | number | string} scalar
 * 
 * @typedef {Array<scalar> & { type: string }} DomainArray An array with type annotation
 */

export class DomainBuilder {
    constructor() {
        /** @type {string} */
        this.type = undefined;
        /** @type {Iterable<scalar>} */
        this.domain = undefined;
    }

    /**
     * 
     * @param {scalar} value 
     * @returns {DomainBuilder}
     */
    extend(value) {
        return this;
    }

    /**
     * 
     * @param {Iterable<scalar>} values 
     * @returns {DomainBuilder}
     */
    extendAll(values) {
        for (const value of values) {
            this.extend(value);
        }

        return this;
    }

    /**
     * @returns {DomainArray}
     */
    toArray() {
        return annotateDomain([...this.domain], this.type);
    }
}

class QuantitativeDomainBuilder extends DomainBuilder {
    constructor() {
        super();
        this.type = "quantitative";
        /** @type {number[]} */
        this.domain = [];
    }

    /**
     * 
     * @param {scalar} value 
     * @returns {DomainBuilder}
     */
    extend(value) {
        if (value === null || value === undefined) {
            return this;
        }

        if (typeof value !== "number") {
            throw new Error("Quantitative domain accepts only numbers!")
        }

        if (this.domain.length) {
            if (value < this.domain[0]) {
                this.domain[0] = value;
            } else if (value > this.domain[1]) {
                this.domain[1] = value;
            }

        } else {
            this.domain = [value, value];
        }

        return this;
    }
}

/**
 * Builder that tries to preserve the order
 */
class OrdinalDomainBuilder extends DomainBuilder {
    constructor() {
        super();
        this.type = "ordinal";

        /** @type {Set<scalar>} */
        this.values = new Set();
        /** @type {scalar[]} */
        this.domain = [];
    }

    /**
     * 
     * @param {scalar} value 
     * @returns {DomainBuilder}
     */
    extend(value) {
        if (value === null || value === undefined) {
            return this;
        }

        if (!this.values.has(value)) {
            this.values.add(value);
            this.domain.push(value);
        }
    }

}

class NominalDomainBuilder extends OrdinalDomainBuilder {
    constructor() {
        super();
        this.type = "nominal";
    }
}

/**
 * @type Object.<string, typeof DomainBuilder>
 */
const builders = {
    "quantitative": QuantitativeDomainBuilder,
    "nominal": NominalDomainBuilder,
    "ordinal": OrdinalDomainBuilder
}

/**
 * 
 * @param {string} type 
 */
export default function createDomainBuilder(type) {
    if (builders[type]) {
        const b = new builders[type]();
        b.type = type;
        return b;
    }
    
    throw new Error("Unknown type: " + type);
}

/**
 * 
 * @param {scalar[]} array 
 * @param {string} type 
 * @returns {DomainArray}
 */
export function annotateDomain(array, type) {
    const annotated = /** @type {DomainArray} */(array);
    annotated.type = type;
    return annotated;
}


/**
 * 
 * @param {array} array 
 */
export function isDomainArray(array) {
    return Array.isArray(array) && typeof /** @type {DomainArray} */(array).type === "string";
}