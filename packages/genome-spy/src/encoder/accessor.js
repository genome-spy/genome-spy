import createFunction from "../utils/expression";

import { field, accessorFields, constant } from "vega-util";

/**
 * @typedef {Object} AccessorMetadata
 * @prop {boolean} constant True if the accessor returns the same value for all objects
 * @prop {string[]} fields The fields that the return value is based on (if any)
 *
 * @typedef {(function(object):any) & AccessorMetadata} Accessor
 *
 * @typedef {import("../view/viewUtils").EncodingConfig} EncodingConfig
 */
export default class AccessorFactory {
    constructor() {
        /** @type {(function(EncodingConfig):Accessor)[]} */
        this.accessorCreators = [];

        this.register(encoding => {
            if (encoding.field) {
                try {
                    /** @type {Accessor} */
                    const accessor = field(encoding.field);
                    accessor.constant = false;
                    accessor.fields = accessorFields(accessor);
                    return accessor;
                } catch (e) {
                    throw new Error(`Invalid field definition: ${e.message}`);
                }
            }
        });

        this.register(encoding =>
            encoding.expr ? createExpressionAccessor(encoding.expr) : undefined
        );

        this.register(encoding => {
            if ("datum" in encoding) {
                /** @type {Accessor} */
                const accessor = constant(encoding.datum);
                accessor.constant = true; // Can be optimized downstream
                accessor.fields = [];
                return accessor;
            }
        });
    }

    /**
     *
     * @param {function(EncodingConfig):Accessor} creator
     */
    register(creator) {
        this.accessorCreators.push(creator);
    }

    /**
     *
     * @param {EncodingConfig} encoding
     */
    createAccessor(encoding) {
        for (const creator of this.accessorCreators) {
            const accessor = creator(encoding);
            if (accessor) {
                return accessor;
            }
        }
    }
}

/**
 * @param {string} expr
 */
function createExpressionAccessor(expr) {
    /** @type {Accessor} */
    const accessor = createFunction(expr);
    accessor.constant = accessor.fields.length == 0; // Not bulletproof, eh
    return accessor;
}
