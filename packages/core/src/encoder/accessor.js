import createFunction from "../utils/expression";

import { accessorFields, constant } from "vega-util";
import { isDatumDef, isExprDef, isFieldDef } from "./encoder";
import { field } from "../utils/field";

/**
 * @typedef {Object} AccessorMetadata
 * @prop {boolean} constant True if the accessor returns the same value for all objects
 * @prop {string[]} fields The fields that the return value is based on (if any)
 *
 * @typedef {(function(any):any) & AccessorMetadata} Accessor
 *
 * @typedef {import("../view/viewUtils").ChannelDef} ChannelDef
 */
export default class AccessorFactory {
    constructor() {
        /** @type {(function(ChannelDef):Accessor)[]} */
        this.accessorCreators = [];

        this.register((channelDef) => {
            if (isFieldDef(channelDef)) {
                try {
                    /** @type {Accessor} */
                    const accessor = field(channelDef.field);
                    accessor.constant = false;
                    accessor.fields = accessorFields(accessor);
                    return accessor;
                } catch (e) {
                    throw new Error(`Invalid field definition: ${e.message}`);
                }
            }
        });

        this.register((channelDef) =>
            isExprDef(channelDef)
                ? createExpressionAccessor(channelDef.expr)
                : undefined
        );

        this.register((channelDef) => {
            if (isDatumDef(channelDef)) {
                /** @type {Accessor} */
                const accessor = constant(channelDef.datum);
                accessor.constant = true; // Can be optimized downstream
                accessor.fields = [];
                return accessor;
            }
        });
    }

    /**
     *
     * @param {function(ChannelDef):Accessor} creator
     */
    register(creator) {
        this.accessorCreators.push(creator);
    }

    /**
     *
     * @param {ChannelDef} encoding
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
