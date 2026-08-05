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
        this.length = typeof params.length == "number" ? params.length : 0;
        /** @type {(datum: import("../flowNode.js").Datum) => number} */
        let lengthAccessor;
        if (typeof params.length == "number") {
            const collisionLength = params.length;
            lengthAccessor = () => collisionLength;
        } else if (isExprRef(params.length)) {
            lengthAccessor = () => this.length;
        } else {
            lengthAccessor = field(params.length);
        }
        this.lengthAccessor = lengthAccessor;

        this.extent = isExprRef(params.extent) ? undefined : params.extent;
        this._validateExtent();
        /** @type {[number, number] | undefined} */
        this._scaledExtent = params.extent ? [0, 0] : undefined;

        this.positionFactor = isExprRef(params.positionFactor)
            ? 1
            : (params.positionFactor ?? 1);
        this._placementParametersReady =
            !isExprRef(params.length) &&
            !isExprRef(params.positionFactor) &&
            !isExprRef(params.extent);
        /** @type {(() => number) | undefined} */
        this._lengthExpr = undefined;
        /** @type {(() => number) | undefined} */
        this._positionFactorExpr = undefined;
        /** @type {(() => [number, number]) | undefined} */
        this._extentExpr = undefined;

        const updatePlacementParameters = () => {
            const changed = this._refreshPlacementParameters();
            if (changed && this._placementParametersReady && this.completed) {
                this.repropagate();
            }
        };

        /**
         * @param {import("../../spec/parameter.js").ExprRef} exprRef
         */
        const watchExpression = (exprRef) =>
            this.paramRuntime.watchExpression(
                exprRef.expr,
                updatePlacementParameters,
                {
                    scopeOwned: false,
                    registerDisposer: (disposer) =>
                        this.registerDisposer(disposer),
                }
            );

        this._lengthExpr = isExprRef(params.length)
            ? watchExpression(params.length)
            : undefined;
        this._positionFactorExpr = isExprRef(params.positionFactor)
            ? watchExpression(params.positionFactor)
            : undefined;
        this._extentExpr = isExprRef(params.extent)
            ? watchExpression(params.extent)
            : undefined;

        /** @type {import("../flowNode.js").Datum[]} */
        this._data = [];
    }

    complete() {
        const data = this._data;

        if (!this._placementParametersReady) {
            // Establish data-driven scale domains before evaluating an
            // expression that may call scale().
            for (const datum of data) {
                const output = Object.assign({}, datum);
                output[this.as] = 0;
                this._propagate(output);
            }
            super.complete();
            data.length = 0;

            this._refreshPlacementParameters();
            this._placementParametersReady = true;
            // Let the bootstrap propagation unwind before replaying the
            // upstream collector with the now-established scale domain.
            queueMicrotask(() => this.repropagate());
            return;
        }

        this._validatePositionFactor();
        if (this._lengthExpr) {
            this._validateLength();
        }
        this._validateExtent();
        const positions = new Array(data.length);
        const lengths = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            positions[i] = this.positionAccessor(data[i]) * this.positionFactor;
            lengths[i] = this.lengthAccessor(data[i]);
        }
        if (this.extent) {
            const first = this.extent[0] * this.positionFactor;
            const second = this.extent[1] * this.positionFactor;
            this._scaledExtent[0] = Math.min(first, second);
            this._scaledExtent[1] = Math.max(first, second);
        }
        const displacements = solveDisplacement(
            positions,
            lengths,
            undefined,
            this._scaledExtent
        );

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

    _validateLength() {
        if (!Number.isFinite(this.length) || this.length < 0) {
            throw new Error(
                "displace1d expression-backed length must be a finite non-negative number."
            );
        }
    }

    _validateExtent() {
        if (
            this.extent &&
            (!Number.isFinite(this.extent[0]) ||
                !Number.isFinite(this.extent[1]) ||
                this.extent[0] > this.extent[1])
        ) {
            throw new Error(
                "displace1d extent must contain finite ascending bounds."
            );
        }
    }

    _refreshPlacementParameters() {
        const length = this._lengthExpr ? this._lengthExpr() : this.length;
        const positionFactor = this._positionFactorExpr
            ? this._positionFactorExpr()
            : this.positionFactor;
        const extent = this._extentExpr ? this._extentExpr() : this.extent;

        if (
            this._extentExpr &&
            (!Array.isArray(extent) || extent.length != 2)
        ) {
            throw new Error(
                "displace1d extent must contain finite ascending bounds."
            );
        }

        const changed =
            length != this.length ||
            positionFactor != this.positionFactor ||
            extent?.[0] != this.extent?.[0] ||
            extent?.[1] != this.extent?.[1];

        this.length = length;
        this.positionFactor = positionFactor;
        this.extent = extent
            ? /** @type {[number, number]} */ ([extent[0], extent[1]])
            : undefined;
        this._validateLength();
        this._validatePositionFactor();
        this._validateExtent();

        return changed;
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
