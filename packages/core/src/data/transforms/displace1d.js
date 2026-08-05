import { BEHAVIOR_COLLECTS, BEHAVIOR_MODIFIES } from "../flowNode.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import { solveDisplacement } from "./displace1dSolver.js";

/**
 * Computes non-overlapping placements for an ordered one-dimensional batch.
 */
export default class Displace1DTransform extends Transform {
    /** @type {[number, number] | undefined} */
    #scaledExtent = undefined;

    #placementBootstrapped = false;

    /** @type {(() => number) | undefined} */
    #lengthExpr = undefined;

    /** @type {(() => number) | undefined} */
    #positionFactorExpr = undefined;

    /** @type {(() => [number, number]) | undefined} */
    #extentExpr = undefined;

    /** @type {import("../flowNode.js").Datum[]} */
    #data = [];

    get behavior() {
        return BEHAVIOR_COLLECTS | BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").Displace1DParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

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
        this.#scaledExtent = params.extent ? [0, 0] : undefined;

        this.positionFactor = isExprRef(params.positionFactor)
            ? 1
            : (params.positionFactor ?? 1);
        this.#placementBootstrapped = !(
            isExprRef(params.length) ||
            isExprRef(params.positionFactor) ||
            isExprRef(params.extent)
        );

        const updatePlacementParameters = () => {
            if (!this.#placementBootstrapped) {
                return;
            }

            const placementChanged = this.#refreshPlacementParameters();
            if (placementChanged && this.completed) {
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

        this.#lengthExpr = isExprRef(params.length)
            ? watchExpression(params.length)
            : undefined;
        this.#positionFactorExpr = isExprRef(params.positionFactor)
            ? watchExpression(params.positionFactor)
            : undefined;
        this.#extentExpr = isExprRef(params.extent)
            ? watchExpression(params.extent)
            : undefined;
        this.#validatePlacementParameters(
            this.length,
            this.positionFactor,
            this.extent
        );
    }

    complete() {
        const data = this.#data;

        if (!this.#placementBootstrapped) {
            // Establish data-driven scale domains before evaluating an
            // expression that may call scale().
            for (const datum of data) {
                datum[this.as] = 0;
                this._propagate(datum);
            }
            super.complete();
            data.length = 0;

            this.#refreshPlacementParameters();
            this.#placementBootstrapped = true;
            // Let the bootstrap propagation unwind before replaying the
            // upstream collector with the now-established scale domain.
            queueMicrotask(() => this.repropagate());
            return;
        }

        const positions = new Array(data.length);
        const lengths = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            positions[i] = this.positionAccessor(data[i]) * this.positionFactor;
            lengths[i] = this.lengthAccessor(data[i]);
        }
        if (this.extent) {
            const first = this.extent[0] * this.positionFactor;
            const second = this.extent[1] * this.positionFactor;
            this.#scaledExtent[0] = Math.min(first, second);
            this.#scaledExtent[1] = Math.max(first, second);
        }
        const displacements = solveDisplacement(
            positions,
            lengths,
            undefined,
            this.#scaledExtent
        );

        for (let i = 0; i < data.length; i++) {
            data[i][this.as] = displacements[i];
            this._propagate(data[i]);
        }

        super.complete();
        data.length = 0;
    }

    /**
     * @param {number} length
     * @param {number} positionFactor
     * @param {[number, number] | undefined} extent
     */
    #validatePlacementParameters(length, positionFactor, extent) {
        if (!Number.isFinite(positionFactor)) {
            throw new Error(
                "displace1d positionFactor must be a finite number."
            );
        }
        if (!Number.isFinite(length) || length < 0) {
            throw new Error(
                `displace1d ${this.#lengthExpr ? "expression-backed length" : "length"} must be a finite non-negative number.`
            );
        }
        if (
            extent !== undefined &&
            (!Array.isArray(extent) ||
                extent.length != 2 ||
                !Number.isFinite(extent[0]) ||
                !Number.isFinite(extent[1]) ||
                extent[0] > extent[1])
        ) {
            throw new Error(
                "displace1d extent must contain finite ascending bounds."
            );
        }
    }

    #refreshPlacementParameters() {
        const length = this.#lengthExpr ? this.#lengthExpr() : this.length;
        const positionFactor = this.#positionFactorExpr
            ? this.#positionFactorExpr()
            : this.positionFactor;
        const extent = this.#extentExpr ? this.#extentExpr() : this.extent;
        this.#validatePlacementParameters(length, positionFactor, extent);

        const placementChanged =
            length != this.length ||
            positionFactor != this.positionFactor ||
            extent?.[0] != this.extent?.[0] ||
            extent?.[1] != this.extent?.[1];

        this.length = length;
        this.positionFactor = positionFactor;
        this.extent = extent
            ? /** @type {[number, number]} */ ([extent[0], extent[1]])
            : undefined;

        return placementChanged;
    }

    reset() {
        super.reset();
        this.#data.length = 0;
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this.#data.push(datum);
    }
}
