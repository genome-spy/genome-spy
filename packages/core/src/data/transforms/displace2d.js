import { BEHAVIOR_COLLECTS, BEHAVIOR_MODIFIES } from "../flowNode.js";
import {
    activateExprRefProps,
    isExprRef,
} from "../../paramRuntime/paramUtils.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import { Displace2DRelaxation } from "./displace2dRelaxation.js";
import { solveDisplacement } from "./displace2dSolver.js";

const FRAME_BUDGET = 4;
const MAX_STEPS_PER_FRAME = 4;

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

    #debouncePending = false;

    /** @type {import("../../scales/scaleResolution.js").default} */
    #xScaleResolution;

    /** @type {import("../../scales/scaleResolution.js").default} */
    #yScaleResolution;

    /** @type {import("../flowNode.js").Datum[]} */
    #data = [];

    // TODO: A shared buffered-transform helper could own datum and batch-marker
    // capture/replay. TransitionTransform currently implements the same pattern.
    /** @type {{ index: number, flowBatch: import("../../types/flowBatch.js").FlowBatch }[]} */
    #batchStarts = [];

    /** @type {import("../flowNode.js").Datum[]} */
    #liveData = [];

    /** @type {{ index: number, flowBatch: import("../../types/flowBatch.js").FlowBatch }[]} */
    #liveBatchStarts = [];

    /** @type {Displace2DRelaxation[]} */
    #relaxations = [];

    /** @type {WeakMap<import("../flowNode.js").Datum, import("./displace2dRelaxation.js").RelaxationItem>} */
    #stateByDatum = new WeakMap();

    #animationRequested = false;

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

        this.animator = paramRuntimeProvider?.context?.animator;

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
            if (this.#placementBootstrapped && this.completed) {
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
        const props = this.#placementProps;
        this.widthAccessor = dimensionAccessor(params.width, () => props.width);
        this.heightAccessor = dimensionAccessor(
            params.height,
            () => props.height
        );
        this.anchorWidthAccessor = dimensionAccessor(
            params.anchorWidth,
            () => props.anchorWidth
        );
        this.anchorHeightAccessor = dimensionAccessor(
            params.anchorHeight,
            () => props.anchorHeight
        );

        if (this.scalePositions) {
            const view = /** @type {import("../../view/view.js").default} */ (
                paramRuntimeProvider
            );
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
            this.#cancelReplay();
            this.#cancelAnimation();
        });
    }

    complete() {
        const data = this.#data;

        if (this.#debouncePending) {
            // An upstream scale-dependent transform may replay while placement
            // is debounced. Keep the previously published rows and offsets
            // intact until the trailing replay recomputes the whole branch.
            this.#clearBufferedData();
            return;
        }

        const bootstrap = !this.#placementBootstrapped;
        if (bootstrap || (this.scalePositions && !this.#hasScaleLayout())) {
            // Establish data-driven scale domains before reading the scales,
            // or publish neutral offsets until layout is available.
            for (const datum of data) {
                datum[this.as[0]] = 0;
                datum[this.as[1]] = 0;
            }
            this.#publishBufferedData();
            if (bootstrap) {
                this.#placementBootstrapped = true;
                this.#scheduleReplay(0);
            }
            return;
        }

        this.#placeFacets();
        this.#publishBufferedData();
        this.#requestAnimation();
    }

    /** @param {import("../flowNode.js").Datum[]} data */
    #place(data) {
        const props = this.#placementProps;
        const placedData = [];
        const xPositions = [];
        const yPositions = [];
        const widths = [];
        const heights = [];
        const anchorWidths = this.usesAnchorObstacles
            ? /** @type {number[]} */ ([])
            : undefined;
        const anchorHeights = this.usesAnchorObstacles
            ? /** @type {number[]} */ ([])
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

        for (const datum of data) {
            const x = this.scalePositions
                ? xScale(this.xAccessor(datum)) * xAxisLength
                : this.xAccessor(datum) * props.xPositionFactor;
            const y = this.scalePositions
                ? (1 - yScale(this.yAccessor(datum))) * yAxisLength
                : this.yAccessor(datum) * props.yPositionFactor;

            // The solver keeps label boxes inside its extents. Giving it an
            // off-viewport anchor would therefore pull that label into view.
            // Exclude the datum and clear offsets left by an earlier scale state.
            if (
                this.scalePositions &&
                !(x >= 0 && x <= xAxisLength && y >= 0 && y <= yAxisLength)
            ) {
                datum[this.as[0]] = 0;
                datum[this.as[1]] = 0;
                continue;
            }

            placedData.push(datum);
            xPositions.push(x);
            yPositions.push(y);
            widths.push(this.widthAccessor(datum));
            heights.push(this.heightAccessor(datum));
            if (this.usesAnchorObstacles) {
                anchorWidths.push(this.anchorWidthAccessor(datum));
                anchorHeights.push(this.anchorHeightAccessor(datum));
            }
        }

        if (placedData.length == 0) {
            return undefined;
        }

        /** @type {[number, number] | undefined} */
        const xExtent = this.scalePositions
            ? [0, xAxisLength]
            : scaleExtent(props.xExtent, props.xPositionFactor);
        /** @type {[number, number] | undefined} */
        const yExtent = this.scalePositions
            ? [0, yAxisLength]
            : scaleExtent(props.yExtent, props.yPositionFactor);
        const displacements = solveDisplacement(
            xPositions,
            yPositions,
            widths,
            heights,
            xExtent,
            yExtent,
            this.usesAnchorObstacles
                ? {
                      x: xPositions,
                      y: yPositions,
                      width: anchorWidths,
                      height: anchorHeights,
                  }
                : undefined
        );

        /** @type {import("./displace2dRelaxation.js").RelaxationItem[]} */
        const items = [];
        const progressive =
            this.animator && this.animator.transitionsEnabled !== false;
        for (let i = 0; i < placedData.length; i++) {
            const datum = placedData[i];
            const anchorX = xPositions[i];
            const anchorY = yPositions[i];
            let item = progressive ? this.#stateByDatum.get(datum) : undefined;
            if (item) {
                item.x += anchorX - item.anchorX;
                item.y += anchorY - item.anchorY;
                item.vx *= 0.5;
                item.vy *= 0.5;
                item.datum = datum;
                item.anchorX = anchorX;
                item.anchorY = anchorY;
                item.width = widths[i];
                item.height = heights[i];
                item.anchorWidth = anchorWidths?.[i] ?? 0;
                item.anchorHeight = anchorHeights?.[i] ?? 0;
                item.priority = i;
            } else {
                item = {
                    datum,
                    anchorX,
                    anchorY,
                    x: anchorX + displacements.x[i],
                    y: anchorY + displacements.y[i],
                    vx: 0,
                    vy: 0,
                    width: widths[i],
                    height: heights[i],
                    anchorWidth: anchorWidths?.[i] ?? 0,
                    anchorHeight: anchorHeights?.[i] ?? 0,
                    priority: i,
                };
                if (progressive) {
                    this.#stateByDatum.set(datum, item);
                }
            }
            items.push(item);
            datum[this.as[0]] = item.x - anchorX;
            datum[this.as[1]] = item.y - anchorY;
        }

        return new Displace2DRelaxation(items, xExtent, yExtent);
    }

    #placeFacets() {
        // TODO: Whole-batch transforms could share facet iteration while keeping
        // their computation and publication lifecycles transform-specific.
        // File boundaries preserve source metadata, not collision groups.
        this.#relaxations = [];
        let facetStart = 0;
        for (const { index, flowBatch } of this.#batchStarts) {
            if (flowBatch.type == "facet") {
                if (index > facetStart) {
                    const relaxation = this.#place(
                        this.#data.slice(facetStart, index)
                    );
                    if (relaxation) {
                        this.#relaxations.push(relaxation);
                    }
                }
                facetStart = index;
            }
        }
        if (facetStart < this.#data.length) {
            const relaxation = this.#place(
                facetStart == 0 ? this.#data : this.#data.slice(facetStart)
            );
            if (relaxation) {
                this.#relaxations.push(relaxation);
            }
        }
    }

    /**
     * @param {import("../flowNode.js").Datum[]} data
     * @param {{ index: number, flowBatch: import("../../types/flowBatch.js").FlowBatch }[]} batchStarts
     */
    #propagateData(data, batchStarts) {
        let start = 0;
        for (const { index, flowBatch } of batchStarts) {
            while (start < index) {
                this._propagate(data[start++]);
            }
            super.beginBatch(flowBatch);
        }
        while (start < data.length) {
            this._propagate(data[start++]);
        }
    }

    #publishBufferedData() {
        this.#propagateData(this.#data, this.#batchStarts);
        super.complete();
        this.#liveData = this.#data.slice();
        this.#liveBatchStarts = this.#batchStarts.slice();
        this.#clearBufferedData();
    }

    #requestAnimation() {
        if (
            !this.animator ||
            this.animator.transitionsEnabled === false ||
            this.#animationRequested ||
            !this.#hasActiveRelaxation()
        ) {
            return;
        }

        this.#animationRequested = true;
        this.animator.requestTransition(this.#animate);
    }

    #cancelAnimation() {
        this.animator?.cancelTransition(this.#animate);
        this.#animationRequested = false;
    }

    /** @param {number} _timestamp */
    #animate = (_timestamp) => {
        this.#animationRequested = false;
        if (this.disposed) {
            return;
        }

        const start = performance.now();
        let changed = false;
        for (let i = 0; i < MAX_STEPS_PER_FRAME; i++) {
            changed = this.#stepRelaxations() || changed;
            if (
                !this.#hasActiveRelaxation() ||
                performance.now() - start >= FRAME_BUDGET
            ) {
                break;
            }
        }

        if (changed) {
            this.#writeRelaxedOffsets();
            this.#replayChildren();
        }
        this.#requestAnimation();
    };

    #stepRelaxations() {
        let changed = false;
        for (const relaxation of this.#relaxations) {
            if (relaxation.active) {
                changed = relaxation.step() || changed;
            }
        }
        return changed;
    }

    #hasActiveRelaxation() {
        return this.#relaxations.some((relaxation) => relaxation.active);
    }

    #writeRelaxedOffsets() {
        for (const relaxation of this.#relaxations) {
            for (const item of relaxation.items) {
                item.datum[this.as[0]] = item.x - item.anchorX;
                item.datum[this.as[1]] = item.y - item.anchorY;
            }
        }
    }

    #replayChildren() {
        for (const child of this.children) {
            child.reset();
        }
        this.#propagateData(this.#liveData, this.#liveBatchStarts);
        for (const child of this.children) {
            child.complete();
        }
    }

    #clearBufferedData() {
        this.#data.length = 0;
        this.#batchStarts.length = 0;
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
        this.#cancelReplay();
        if (!this.#isReplayReady()) {
            return;
        }

        if (wait > 0) {
            this.#debouncePending = true;
            this.#replayTimer = setTimeout(() => {
                this.#debouncePending = false;
                this.paramRuntime.requestUpdate(this.#runScheduledReplay);
            }, wait);
        } else {
            this.paramRuntime.requestUpdate(this.#runScheduledReplay);
        }
    }

    #cancelReplay() {
        clearTimeout(this.#replayTimer);
        this.#debouncePending = false;
        this.paramRuntimeProvider?.paramRuntime?.cancelUpdate(
            this.#runScheduledReplay
        );
    }

    reset() {
        this.#cancelAnimation();
        if (!this.#debouncePending) {
            super.reset();
        }
        this.#clearBufferedData();
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     */
    handle(datum) {
        this.#data.push(datum);
    }
}

/**
 * @param {import("../../spec/transform.js").Displace2DParams["anchorWidth"]} param
 * @param {() => PlacementProps["width"]} getValue
 * @returns {(datum: import("../flowNode.js").Datum) => number}
 */
function dimensionAccessor(param, getValue) {
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
