import { BEHAVIOR_COLLECTS, BEHAVIOR_MODIFIES } from "../flowNode.js";
import {
    activateExprRefProps,
    isExprRef,
} from "../../paramRuntime/paramUtils.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import { solveDisplacement } from "./displace2dSolver.js";

/**
 * @typedef {object} PlacementProps
 * @prop {number | import("../../spec/channel.js").Field} width
 * @prop {number | import("../../spec/channel.js").Field} height
 * @prop {number | import("../../spec/channel.js").Field} anchorWidth
 * @prop {number | import("../../spec/channel.js").Field} anchorHeight
 * @prop {number} xPositionFactor
 * @prop {number} yPositionFactor
 * @prop {[number, number] | undefined} xExtent
 * @prop {[number, number] | undefined} yExtent
 */

/**
 * Computes non-overlapping placements for a two-dimensional batch.
 */
export default class Displace2DTransform extends Transform {
    #placementBootstrapped = false;

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    #replayTimer;

    #replayUpdatePending = false;
    #debouncePending = false;

    /** @type {import("../../scales/scaleResolution.js").default} */
    #xScaleResolution;

    /** @type {import("../../scales/scaleResolution.js").default} */
    #yScaleResolution;

    /** @type {import("../flowNode.js").Datum[]} */
    #data = [];

    /** @type {{ index: number, flowBatch: import("../../types/flowBatch.js").FlowBatch }[]} */
    #batchStarts = [];

    /** @type {PlacementProps} */
    #placementProps;

    get behavior() {
        return BEHAVIOR_COLLECTS | BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").Displace2DParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.scalePositions = params.scalePositions ?? false;
        this.debounce = params.debounce ?? 50;
        if (
            this.scalePositions &&
            (params.xPositionFactor !== undefined ||
                params.yPositionFactor !== undefined ||
                params.xExtent !== undefined ||
                params.yExtent !== undefined)
        ) {
            throw new Error(
                "displace2d scalePositions cannot be combined with position factors or extents."
            );
        }

        this.as = params.as ?? ["xDisplacement", "yDisplacement"];
        this.xAccessor = field(params.x);
        this.yAccessor = field(params.y);

        this.usesAnchorObstacles =
            params.anchorWidth !== undefined &&
            params.anchorHeight !== undefined;

        const placementProps = {
            width: params.width,
            height: params.height,
            anchorWidth: params.anchorWidth ?? 0,
            anchorHeight: params.anchorHeight ?? 0,
            xPositionFactor: params.xPositionFactor ?? 1,
            yPositionFactor: params.yPositionFactor ?? 1,
            xExtent: params.xExtent,
            yExtent: params.yExtent,
        };
        const hasReactiveProps = Object.values(placementProps).some(isExprRef);
        this.#placementBootstrapped = !hasReactiveProps && !this.scalePositions;

        const placementChanged = () => {
            if (!this.#placementBootstrapped || this.disposed) {
                return;
            }

            if (this.completed) {
                this.#scheduleReplay();
            }
        };

        this.#placementProps = hasReactiveProps
            ? /** @type {any} */ (
                  activateExprRefProps(
                      this.paramRuntime,
                      placementProps,
                      placementChanged,
                      (disposer) => this.registerDisposer(disposer)
                  )
              )
            : /** @type {any} */ (placementProps);

        this.widthAccessor = createDimensionAccessor(
            params.width,
            () => this.#placementProps.width
        );
        this.heightAccessor = createDimensionAccessor(
            params.height,
            () => this.#placementProps.height
        );
        this.anchorWidthAccessor = createDimensionAccessor(
            params.anchorWidth,
            () => this.#placementProps.anchorWidth
        );
        this.anchorHeightAccessor = createDimensionAccessor(
            params.anchorHeight,
            () => this.#placementProps.anchorHeight
        );

        if (this.scalePositions) {
            const view = /** @type {import("../../view/view.js").default} */ (
                paramRuntimeProvider
            );
            if (
                typeof view.getScaleResolution != "function" ||
                typeof view._addBroadcastHandler != "function"
            ) {
                throw new Error("displace2d scalePositions requires a view.");
            }

            this.#xScaleResolution = view.getScaleResolution("x");
            this.#yScaleResolution = view.getScaleResolution("y");
            if (!this.#xScaleResolution || !this.#yScaleResolution) {
                throw new Error(
                    "displace2d scalePositions requires x and y scales."
                );
            }

            const scaleChanged = () => this.#scheduleReplay();
            for (const resolution of [
                this.#xScaleResolution,
                this.#yScaleResolution,
            ]) {
                this.registerDisposer(
                    resolution.getMappingRef().subscribe(scaleChanged)
                );
            }
            this.registerDisposer(
                view._addBroadcastHandler("layoutComputed", () =>
                    this.#scheduleReplay(0)
                )
            );
        }

        this.registerDisposer(() => {
            clearTimeout(this.#replayTimer);
            this.#replayTimer = undefined;
            this.#debouncePending = false;
            if (this.#replayUpdatePending) {
                this.paramRuntime.cancelUpdate(this.#runScheduledReplay);
                this.#replayUpdatePending = false;
            }
        });
    }

    complete() {
        const data = this.#data;

        if (this.#debouncePending) {
            // An upstream scale-dependent transform may replay while placement
            // is debounced. Keep the previously published rows and offsets
            // intact until the trailing replay recomputes the whole branch.
            data.length = 0;
            this.#batchStarts.length = 0;
            return;
        }

        if (!this.#placementBootstrapped) {
            // Establish data-driven scale domains before reading the scales.
            for (const datum of data) {
                datum[this.as[0]] = 0;
                datum[this.as[1]] = 0;
            }
            this.#propagateBatches(false);
            super.complete();
            data.length = 0;

            this.#placementBootstrapped = true;
            this.#scheduleReplay(0);
            return;
        }

        if (this.scalePositions && !this.#hasScaleLayout()) {
            for (const datum of data) {
                datum[this.as[0]] = 0;
                datum[this.as[1]] = 0;
            }
            this.#propagateBatches(false);
            super.complete();
            data.length = 0;
            return;
        }

        this.#propagateBatches(true);
        super.complete();
        data.length = 0;
    }

    /** @param {import("../flowNode.js").Datum[]} data */
    #place(data) {
        const props = this.#placementProps;
        const count = data.length;
        const xPositions = new Array(count);
        const yPositions = new Array(count);
        const widths = new Array(count);
        const heights = new Array(count);
        const anchorWidths = this.usesAnchorObstacles
            ? new Array(count)
            : undefined;
        const anchorHeights = this.usesAnchorObstacles
            ? new Array(count)
            : undefined;
        const xScale = this.scalePositions
            ? this.#xScaleResolution.getScale()
            : undefined;
        const yScale = this.scalePositions
            ? this.#yScaleResolution.getScale()
            : undefined;
        const xAxisLength = this.scalePositions
            ? this.#xScaleResolution.getAxisLength()
            : 0;
        const yAxisLength = this.scalePositions
            ? this.#yScaleResolution.getAxisLength()
            : 0;

        for (let i = 0; i < count; i++) {
            const datum = data[i];
            xPositions[i] = this.scalePositions
                ? xScale(this.xAccessor(datum)) * xAxisLength
                : this.xAccessor(datum) * props.xPositionFactor;
            yPositions[i] = this.scalePositions
                ? (1 - yScale(this.yAccessor(datum))) * yAxisLength
                : this.yAccessor(datum) * props.yPositionFactor;
            widths[i] = this.widthAccessor(datum);
            heights[i] = this.heightAccessor(datum);
            if (this.usesAnchorObstacles) {
                anchorWidths[i] = this.anchorWidthAccessor(datum);
                anchorHeights[i] = this.anchorHeightAccessor(datum);
            }
        }

        const displacements = solveDisplacement(
            xPositions,
            yPositions,
            widths,
            heights,
            this.scalePositions
                ? [0, xAxisLength]
                : scaleExtent(props.xExtent, props.xPositionFactor),
            this.scalePositions
                ? [0, yAxisLength]
                : scaleExtent(props.yExtent, props.yPositionFactor),
            this.usesAnchorObstacles
                ? {
                      x: xPositions,
                      y: yPositions,
                      width: anchorWidths,
                      height: anchorHeights,
                  }
                : undefined
        );
        for (let i = 0; i < count; i++) {
            const datum = data[i];
            const dx = displacements.x[i];
            const dy = displacements.y[i];
            datum[this.as[0]] = dx;
            datum[this.as[1]] = dy;
        }
    }

    /** @param {boolean} place */
    #propagateBatches(place) {
        if (place) {
            // File boundaries preserve source metadata, not collision groups.
            let facetStart = 0;
            for (const { index, flowBatch } of this.#batchStarts) {
                if (flowBatch.type == "facet") {
                    if (index > facetStart) {
                        this.#place(this.#data.slice(facetStart, index));
                    }
                    facetStart = index;
                }
            }
            if (facetStart < this.#data.length) {
                this.#place(
                    facetStart == 0 ? this.#data : this.#data.slice(facetStart)
                );
            }
        }

        let start = 0;
        const emit = (/** @type {number} */ stop) => {
            while (start < stop) this._propagate(this.#data[start++]);
        };
        for (const { index, flowBatch } of this.#batchStarts) {
            emit(index);
            super.beginBatch(flowBatch);
        }
        emit(this.#data.length);
    }

    /** @param {import("../../types/flowBatch.js").FlowBatch} flowBatch */
    beginBatch(flowBatch) {
        this.#batchStarts.push({ index: this.#data.length, flowBatch });
    }

    #hasScaleLayout() {
        return (
            this.#xScaleResolution.getAxisLength() > 0 &&
            this.#yScaleResolution.getAxisLength() > 0
        );
    }

    #runScheduledReplay = () => {
        this.#replayUpdatePending = false;
        if (this.#isReplayReady()) {
            this.requestRepropagate();
        }
    };

    #isReplayReady() {
        return (
            this.#placementBootstrapped &&
            !this.disposed &&
            this.completed &&
            (!this.scalePositions || this.#hasScaleLayout())
        );
    }

    /** @param {number} [wait] */
    #scheduleReplay(wait = this.debounce) {
        if (!this.#isReplayReady()) {
            clearTimeout(this.#replayTimer);
            this.#replayTimer = undefined;
            this.#debouncePending = false;
            return;
        }

        if (wait > 0) {
            if (this.#replayUpdatePending) {
                return;
            }
            this.#debouncePending = true;
            clearTimeout(this.#replayTimer);
            this.#replayTimer = setTimeout(() => {
                this.#replayTimer = undefined;
                this.#debouncePending = false;
                this.#queueReplay();
            }, wait);
        } else {
            clearTimeout(this.#replayTimer);
            this.#replayTimer = undefined;
            this.#debouncePending = false;
            this.#queueReplay();
        }
    }

    #queueReplay() {
        if (!this.#replayUpdatePending) {
            this.#replayUpdatePending = true;
            this.paramRuntime.requestUpdate(this.#runScheduledReplay, 0, () => {
                this.#replayUpdatePending = false;
            });
        }
    }

    reset() {
        if (!this.#debouncePending) {
            super.reset();
        }
        this.#data.length = 0;
        this.#batchStarts.length = 0;
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this.#data.push(datum);
    }
}

/**
 * @param {number | import("../../spec/channel.js").Field | import("../../spec/parameter.js").ExprRef | undefined} param
 * @param {() => number | import("../../spec/channel.js").Field} getValue
 * @returns {(datum: import("../flowNode.js").Datum) => number}
 */
function createDimensionAccessor(param, getValue) {
    return typeof param == "string"
        ? field(param)
        : () => /** @type {number} */ (getValue());
}

/**
 * @param {[number, number] | undefined} extent
 * @param {number} factor
 * @returns {[number, number] | undefined}
 */
function scaleExtent(extent, factor) {
    if (!extent) {
        return undefined;
    }

    const first = extent[0] * factor;
    const second = extent[1] * factor;
    return [Math.min(first, second), Math.max(first, second)];
}
