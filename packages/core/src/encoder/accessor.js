import { accessorFields, constant } from "vega-util";
import { isDatumDef, isExprDef, isFieldDef } from "./encoder.js";
import { field } from "../utils/field.js";

export default class AccessorFactory {
    /** @type {Creator[]} */
    #accessorCreators = [];

    /**
     * @typedef {import("../types/encoder.js").Accessor} Accessor
     * @typedef {import("../view/paramMediator.js").default} ParamMediator
     * @typedef {(channel: import("../spec/channel.js").ChannelDef, paramMediator: ParamMediator) => Accessor} Creator
     */
    constructor() {
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

        this.register((channelDef, paramMediator) => {
            if (isExprDef(channelDef)) {
                // TODO: If parameters change, the data should be re-evaluated
                const fn = paramMediator.createExpression(channelDef.expr);
                const accessor = /** @type {Accessor} */ (
                    /** @type {any} */ (fn)
                );
                accessor.constant = false;
                accessor.fields = accessorFields(fn);
                return accessor;
            }
        });

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
     * @param {Creator} creator
     */
    register(creator) {
        this.#accessorCreators.push(creator);
    }

    /**
     *
     * @param {import("../spec/channel.js").ChannelDef} encoding
     * @param {ParamMediator} paramMediator
     */
    createAccessor(encoding, paramMediator) {
        for (const creator of this.#accessorCreators) {
            const accessor = creator(encoding, paramMediator);
            if (accessor) {
                return accessor;
            }
        }
    }
}
