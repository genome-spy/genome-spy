import { BEHAVIOR_CLONES, BEHAVIOR_COLLECTS } from "../flowNode.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import {
    createDisplace1DWorkspace,
    solveDisplacement,
} from "./displace1dSolver.js";

/**
 * Computes non-overlapping one-dimensional placements. The emitted objects are
 * retained and reused when the reactive position factor changes.
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
        /** @type {(() => number) | undefined} */
        this._positionFactorExpr = undefined;
        if (isExprRef(params.positionFactor)) {
            const positionFactorExpr = this.paramRuntime.watchExpression(
                params.positionFactor.expr,
                () => {
                    this.positionFactor = positionFactorExpr();
                    this._updateAndPropagate();
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
        this._inputData = [];

        /** @type {import("../flowNode.js").Datum[]} */
        this._outputData = [];

        /** @type {import("../flowNode.js").Datum[]} */
        this._orderedData = [];

        /** @type {import("../flowNode.js").Datum[]} */
        this._reverseOrderedData = [];

        /** @type {number[]} */
        this._displacements = [];
        this._workspace = createDisplace1DWorkspace();
        this._ready = false;

        this._scaledPositionAccessor = (
            /** @type {import("../flowNode.js").Datum} */ datum
        ) => this.positionAccessor(datum) * this.positionFactor;
    }

    complete() {
        this._outputData.length = this._inputData.length;
        for (let i = 0; i < this._inputData.length; i++) {
            const position = this.positionAccessor(this._inputData[i]);
            const length = this.lengthAccessor(this._inputData[i]);
            if (!Number.isFinite(position)) {
                throw new Error("displace1d positions must be finite numbers.");
            } else if (!Number.isFinite(length) || length < 0) {
                throw new Error(
                    "displace1d lengths must be finite non-negative numbers."
                );
            }

            const output = Object.assign({}, this._inputData[i]);
            output[this.as] = 0;
            this._outputData[i] = output;
            this._propagate(output);
        }

        this._orderedData = this._outputData.slice();
        // Array.prototype.sort is stable, preserving input order for ties.
        this._orderedData.sort(
            (a, b) => this.positionAccessor(a) - this.positionAccessor(b)
        );
        this._reverseOrderedData.length = this._orderedData.length;
        let reverseIndex = 0;
        for (let groupEnd = this._orderedData.length; groupEnd > 0;) {
            const groupPosition = this.positionAccessor(
                this._orderedData[groupEnd - 1]
            );
            let groupStart = groupEnd - 1;
            while (
                groupStart > 0 &&
                this.positionAccessor(this._orderedData[groupStart - 1]) ==
                    groupPosition
            ) {
                groupStart--;
            }
            for (let i = groupStart; i < groupEnd; i++) {
                this._reverseOrderedData[reverseIndex++] = this._orderedData[i];
            }
            groupEnd = groupStart;
        }

        this._ready = true;
        // Let the original positions establish data-driven scale domains before
        // evaluating an expression that may call scale().
        super.complete();
        if (this._positionFactorExpr) {
            this.positionFactor = this._positionFactorExpr();
        }
        this._updateAndPropagate();
    }

    _updateAndPropagate() {
        if (!this._ready) {
            return;
        }

        if (!Number.isFinite(this.positionFactor)) {
            throw new Error(
                "displace1d positionFactor must be a finite number."
            );
        }

        const first = this._orderedData[0];
        const last = this._orderedData.at(-1);
        const orderedData =
            first &&
            last &&
            this._scaledPositionAccessor(first) >
                this._scaledPositionAccessor(last)
                ? this._reverseOrderedData
                : this._orderedData;

        solveDisplacement(
            orderedData,
            this._scaledPositionAccessor,
            this.lengthAccessor,
            this._displacements,
            this._workspace
        );

        for (let i = 0; i < orderedData.length; i++) {
            orderedData[i][this.as] = this._displacements[i];
        }

        super.reset();
        for (let i = 0; i < this._outputData.length; i++) {
            this._propagate(this._outputData[i]);
        }
        super.complete();
    }

    reset() {
        super.reset();
        this._inputData.length = 0;
        this._outputData.length = 0;
        this._orderedData.length = 0;
        this._reverseOrderedData.length = 0;
        this._ready = false;
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this._inputData.push(datum);
    }
}
