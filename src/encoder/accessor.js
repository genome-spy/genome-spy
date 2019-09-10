import { parse, codegen } from 'vega-expression';
import { field, constant } from 'vega-util';

/**
 * @typedef {function(object):any} Accessor
 * 
 * @typedef {import("../view/viewUtils").EncodingSpec} EncodingSpec
 */
export default class AccessorFactory {
    constructor() {
        /** @type {(function(EncodingSpec):(function(object):any))[]} */
        this.accessorCreators = [];

        this.register(encoding => (encoding.field ? field(encoding.field) : undefined));

        this.register(encoding => (encoding.expr ? createExpressionAccessor(encoding.expr) : undefined));

        this.register(encoding => {
            if (encoding.constant !== undefined) {
                const accessor = constant(encoding.constant);
                accessor.constant = true; // Can be optimized downstream
                return accessor;
            }
        });
    }

    /**
     * 
     * @param {(function(EncodingSpec):(function(object):any))} creator 
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

    return /** @param {object} datum*/ datum => fn(datum, global);
}