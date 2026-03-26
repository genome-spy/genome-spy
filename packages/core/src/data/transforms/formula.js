import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import Transform from "./transform.js";

export default class FormulaTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").FormulaParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.params = params;

        this.as = params.as;

        /** @type {import("../../paramRuntime/types.js").ExprRefFunction} */
        this.fn = undefined;

        /** @type {boolean} */
        this.constantExpression = false;

        /** @type {any} */
        this.constantValue = undefined;
    }

    initialize() {
        this.fn = this.paramRuntime.watchExpression(
            this.params.expr,
            () => {
                if (this.constantExpression) {
                    this.constantValue = this.fn(null);
                }
                this.repropagate();
            },
            {
                scopeOwned: false,
                registerDisposer: (disposer) => this.registerDisposer(disposer),
            }
        );

        // Expressions without datum field dependencies can be reused across
        // every row until one of their reactive inputs changes.
        this.constantExpression = this.fn.fields.length === 0;
        if (this.constantExpression) {
            this.constantValue = this.fn(null);
        }
    }

    /**
     *
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        datum[this.as] = this.constantExpression
            ? this.constantValue
            : this.fn(datum);
        this._propagate(datum);
    }
}
