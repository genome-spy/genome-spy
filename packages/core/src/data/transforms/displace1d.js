import { BEHAVIOR_CLONES, BEHAVIOR_COLLECTS } from "../flowNode.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import { solveDisplacement } from "./displace1dSolver.js";

/**
 * Computes non-overlapping placements for an ordered one-dimensional batch.
 */
export default class Displace1DTransform extends Transform {
    get behavior() {
        return BEHAVIOR_COLLECTS | BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").Displace1DParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.params = params;
        this.as = params.as ?? "displacement";
        this.positionAccessor = field(params.pos);
        /** @type {(datum: import("../flowNode.js").Datum) => number} */
        let lengthAccessor;
        if (typeof params.length == "number") {
            const collisionLength = params.length;
            lengthAccessor = () => collisionLength;
        } else {
            lengthAccessor = field(params.length);
        }
        this.lengthAccessor = lengthAccessor;

        this.positionFactor = 1;
        this._positionFactorReady = !isExprRef(params.positionFactor);
        /** @type {(() => number) | undefined} */
        this._positionFactorExpr = undefined;

        if (isExprRef(params.positionFactor)) {
            const positionFactorExpr = this.paramRuntime.watchExpression(
                params.positionFactor.expr,
                () => {
                    const positionFactor = positionFactorExpr();
                    if (positionFactor != this.positionFactor) {
                        this.positionFactor = positionFactor;
                        if (this._positionFactorReady && this.completed) {
                            this.repropagate();
                        }
                    }
                },
                {
                    scopeOwned: false,
                    registerDisposer: (disposer) =>
                        this.registerDisposer(disposer),
                }
            );
            this._positionFactorExpr = positionFactorExpr;
        } else {
            this.positionFactor = params.positionFactor ?? 1;
        }

        /** @type {import("../flowNode.js").Datum[]} */
        this._data = [];
    }

    complete() {
        const data = this._data;

        if (!this._positionFactorReady) {
            // Establish data-driven scale domains before evaluating an
            // expression that may call scale().
            for (const datum of data) {
                const output = Object.assign({}, datum);
                output[this.as] = 0;
                this._propagate(output);
            }
            super.complete();
            data.length = 0;

            this.positionFactor = this._positionFactorExpr();
            this._validatePositionFactor();
            this._positionFactorReady = true;
            // Let the bootstrap propagation unwind before replaying the
            // upstream collector with the now-established scale domain.
            queueMicrotask(() => this.repropagate());
            return;
        }

        this._validatePositionFactor();
        const positions = new Array(data.length);
        const lengths = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            positions[i] = this.positionAccessor(data[i]) * this.positionFactor;
            lengths[i] = this.lengthAccessor(data[i]);
        }
        const displacements = solveDisplacement(positions, lengths);

        for (let i = 0; i < data.length; i++) {
            const output = Object.assign({}, data[i]);
            output[this.as] = displacements[i];
            this._propagate(output);
        }

        super.complete();
        data.length = 0;
    }

    _validatePositionFactor() {
        if (!Number.isFinite(this.positionFactor)) {
            throw new Error(
                "displace1d positionFactor must be a finite number."
            );
        }
    }

    reset() {
        super.reset();
        this._data.length = 0;
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this._data.push(datum);
    }
}
