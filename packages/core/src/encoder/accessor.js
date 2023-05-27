import createFunction from "../utils/expression";

import { accessorFields, constant } from "vega-util";
import { isDatumDef, isExprDef, isFieldDef } from "./encoder";
import { field } from "../utils/field";

export default class AccessorFactory {
    /**
     * @typedef {import("../types/encoder").Accessor} Accessor
     */
    constructor() {
        /** @type {(function(import("../spec/channel").ChannelDef):Accessor)[]} */
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
     * @param {function(import("../spec/channel").ChannelDef):Accessor} creator
     */
    register(creator) {
        this.accessorCreators.push(creator);
    }

    /**
     *
     * @param {import("../spec/channel").ChannelDef} encoding
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
    const accessor = /** @type {Accessor} */ (createFunction(expr));
    accessor.constant = accessor.fields.length == 0; // Not bulletproof, eh
    return accessor;
}
