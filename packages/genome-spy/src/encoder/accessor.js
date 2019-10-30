import { parse, codegen } from 'vega-expression';
import { field, constant } from 'vega-util';

/**
 * @typedef {Object} AccessorMetadata
 * @prop {boolean} constant Accessor returns a constant value
 * @prop {string[]} fields The fields that the return value is based on (if any)
 * 
 * @typedef {(function(object):any) & AccessorMetadata} Accessor
 * 
 * @typedef {import("../view/viewUtils").EncodingSpec} EncodingSpec
 */
export default class AccessorFactory {
    constructor() {
        /** @type {(function(EncodingSpec):Accessor)[]} */
        this.accessorCreators = [];

        this.register(encoding => {
            if (encoding.field) {
                /** @type {Accessor} */
                const accessor = field(encoding.field);
                accessor.constant = false;
                accessor.fields = [encoding.field];
                return accessor;
            }
        });

        this.register(encoding => (encoding.expr ? createExpressionAccessor(encoding.expr) : undefined));

        this.register(encoding => {
            if (encoding.constant !== undefined) {
                /** @type {Accessor} */
                const accessor = constant(encoding.constant);
                accessor.constant = true; // Can be optimized downstream
                accessor.fields = [];
                return accessor;
            }
        });
    }

    /**
     * 
     * @param {function(EncodingSpec):Accessor} creator 
     */
    register(creator) {
        this.accessorCreators.push(creator);
    }

    /**
     * 
     * @param {EncodingSpec} encoding 
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
    // Copypaste from formula transform. TODO: Consider extracting a function.

    const cg = codegen({
        blacklist: [],
        whitelist: ["datum"],
        globalvar: "global",
        fieldvar: "datum"
    });

    const parsed = parse(expr);
    const generatedCode = cg(parsed);

    const global = { };

    // eslint-disable-next-line no-new-func
    const fn = Function("datum", "global", `"use strict"; return (${generatedCode.code});`);

    /** @type {Accessor} */
    const accessor = datum => fn(datum, global);
    accessor.fields = generatedCode.fields;
    accessor.constant = accessor.fields.length == 0; // Not bulletproof, eh
    return accessor;
}