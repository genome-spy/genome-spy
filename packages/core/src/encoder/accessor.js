import createFunction from "../utils/expression.js";

import { accessorFields, constant } from "vega-util";
import { isDatumDef, isExprDef, isFieldDef } from "./encoder.js";
import { field } from "../utils/field.js";

export default class AccessorFactory {
    /**
     * @typedef {import("../types/encoder.js").Accessor} Accessor
     */
    constructor() {
        /** @type {(function(import("../spec/channel.js").ChannelDef):Accessor)[]} */
        this.accessorCreators = [];

        this.register((channelDef) => {
            if (isFieldDef(channelDef)) {
                try {
                    const accessor = /** @type {Accessor} */ (
                        field(channelDef.field)
                    );
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
                const c = /** @type {any} */ (constant(channelDef.datum));
                const accessor = /** @type {Accessor} */ (c);
                accessor.constant = true; // Can be optimized downstream
                accessor.fields = [];
                return accessor;
            }
        });
    }

    /**
     *
     * @param {function(import("../spec/channel.js").ChannelDef):Accessor} creator
     */
    register(creator) {
        this.accessorCreators.push(creator);
    }

    /**
     *
     * @param {import("../spec/channel.js").ChannelDef} encoding
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
    const fn = createFunction(expr);
    const accessor = /** @type {Accessor} */ (/** @type {any} */ (fn));
    // Not bulletproof and probably erroneous with global params
    accessor.constant = accessor.fields.length == 0;
    return accessor;
}
