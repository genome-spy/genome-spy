import { BEHAVIOR_COLLECTS, BEHAVIOR_MODIFIES } from "../flowNode.js";
import {
    activateExprRefProps,
    isExprRef,
} from "../../paramRuntime/paramUtils.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import { Displace2DConstraintSolver } from "./displace2dConstraintSolver.js";

const FRAME_BUDGET = 4;
const INITIAL_STEPS = 2;
const MAX_STEPS_PER_FRAME = 64;
const DISPLAY_HALF_LIFE = 60;
const MAX_DISPLAY_STEP = 10;
const DISPLAY_EPSILON = 0.05;
const DEFAULT_FRAME_INTERVAL = 1000 / 60;

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
 * @typedef {import("./displace2dConstraintSolver.js").ConstraintItem & {
 *     displayX: number,
 *     displayY: number
 * }} PlacementItem
 */

/** @typedef {(datum: import("../flowNode.js").Datum) => number} DimensionAccessor */

/** @typedef {Map<any, PlacementItem | undefined> | WeakMap<any, PlacementItem | undefined>} PlacementStateMap */

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

    /** @type {Displace2DConstraintSolver[]} */
    #relaxations = [];

    /** @type {PlacementStateMap} */
    #states;

    #animationRequested = false;

    /** @type {number | undefined} */
    #lastAnimationTimestamp;

    /** @type {PlacementProps} */
    #placementProps;

    /** @type {import("../../utils/animator.js").default | undefined} */
    #animator;

    /** @type {boolean} */
    #scalePositions;

    /** @type {number} */
    #debounce;

    /** @type {[string, string]} */
    #as;

    /** @type {ReturnType<typeof field>} */
    #xAccessor;

    /** @type {ReturnType<typeof field>} */
    #yAccessor;

    /** @type {ReturnType<typeof field> | undefined} */
    #keyAccessor;

    /** @type {DimensionAccessor} */
    #widthAccessor;

    /** @type {DimensionAccessor} */
    #heightAccessor;

    /** @type {DimensionAccessor} */
    #anchorWidthAccessor;

    /** @type {DimensionAccessor} */
    #anchorHeightAccessor;

    get behavior() {
        return BEHAVIOR_COLLECTS | BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").Displace2DParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.#animator = paramRuntimeProvider?.context?.animator;

        this.#scalePositions = params.scalePositions ?? false;
        this.#debounce = params.debounce ?? 50;
        if (
            this.#scalePositions &&
            (params.xPositionFactor !== undefined ||
                params.yPositionFactor !== undefined ||
                params.xExtent !== undefined ||
                params.yExtent !== undefined)
        ) {
            throw new Error(
                "displace2d scalePositions cannot be combined with position factors or extents."
            );
        }

        this.#as = params.as ?? ["xDisplacement", "yDisplacement"];
        if (params.key && this.#as.includes(params.key)) {
            throw new Error("displace2d output fields must preserve the key.");
        }
        this.#xAccessor = field(params.x);
        this.#yAccessor = field(params.y);
        this.#keyAccessor = params.key ? field(params.key) : undefined;
        this.#states = params.key ? new Map() : new WeakMap();

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
        this.#placementBootstrapped =
            !hasReactiveProps && !this.#scalePositions;

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
        this.#widthAccessor = dimensionAccessor(
            params.width,
            () => props.width
        );
        this.#heightAccessor = dimensionAccessor(
            params.height,
            () => props.height
        );
        this.#anchorWidthAccessor = dimensionAccessor(
            params.anchorWidth,
            () => props.anchorWidth
        );
        this.#anchorHeightAccessor = dimensionAccessor(
            params.anchorHeight,
            () => props.anchorHeight
        );

        if (this.#scalePositions) {
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
        if (this.#debouncePending) {
            // An upstream scale-dependent transform may replay while placement
            // is debounced. Keep the previously published rows and offsets
            // intact until the trailing replay recomputes the whole branch.
            this.#clearBufferedData();
            return;
        }

        const bootstrap = !this.#placementBootstrapped;
        if (bootstrap || (this.#scalePositions && !this.#hasScaleLayout())) {
            // Establish data-driven scale domains before reading the scales,
            // or publish neutral offsets until layout is available.
            for (const datum of this.#data) {
                datum[this.#as[0]] = 0;
                datum[this.#as[1]] = 0;
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

    /**
     * @param {import("../flowNode.js").Datum[]} data
     * @param {PlacementStateMap} nextStates
     */
    #place(data, nextStates) {
        const props = this.#placementProps;
        const keyAccessor = this.#keyAccessor;
        const scalePositions = this.#scalePositions;
        const xScale = scalePositions
            ? this.#xScaleResolution.getScale()
            : undefined;
        const yScale = scalePositions
            ? this.#yScaleResolution.getScale()
            : undefined;
        const xAxisLength = scalePositions
            ? this.#xScaleResolution.getAxisLength()
            : 0;
        const yAxisLength = scalePositions
            ? this.#yScaleResolution.getAxisLength()
            : 0;
        /** @type {[number, number] | undefined} */
        const xExtent = scalePositions
            ? [0, xAxisLength]
            : scaleExtent(props.xExtent, props.xPositionFactor);
        /** @type {[number, number] | undefined} */
        const yExtent = scalePositions
            ? [0, yAxisLength]
            : scaleExtent(props.yExtent, props.yPositionFactor);
        /** @type {PlacementItem[]} */
        const items = [];
        const progressive =
            this.#animator && this.#animator.transitionsEnabled !== false;
        let initialized = false;
        let retained = false;

        for (let dataIndex = 0; dataIndex < data.length; dataIndex++) {
            const datum = data[dataIndex];
            const key = keyAccessor ? keyAccessor(datum) : datum;
            if (keyAccessor) {
                validateKey(key);
                if (nextStates.has(key)) {
                    throw new Error(`displace2d key must be unique: ${key}`);
                }
            }
            let item = progressive ? this.#states.get(key) : undefined;
            if (keyAccessor) {
                nextStates.set(key, item);
            }
            const anchorX = scalePositions
                ? xScale(this.#xAccessor(datum)) * xAxisLength
                : this.#xAccessor(datum) * props.xPositionFactor;
            const anchorY = scalePositions
                ? (1 - yScale(this.#yAccessor(datum))) * yAxisLength
                : this.#yAccessor(datum) * props.yPositionFactor;

            // An off-viewport anchor would pull its label back into view.
            if (
                scalePositions &&
                !(
                    anchorX >= 0 &&
                    anchorX <= xAxisLength &&
                    anchorY >= 0 &&
                    anchorY <= yAxisLength
                )
            ) {
                datum[this.#as[0]] = 0;
                datum[this.#as[1]] = 0;
                continue;
            }

            if (item) {
                retained = true;
                const anchorDeltaX = anchorX - item.anchorX;
                const anchorDeltaY = anchorY - item.anchorY;
                item.x += anchorDeltaX;
                item.y += anchorDeltaY;
                item.displayX += anchorDeltaX;
                item.displayY += anchorDeltaY;
                item.datum = datum;
                item.anchorX = anchorX;
                item.anchorY = anchorY;
                item.width = this.#widthAccessor(datum);
                item.height = this.#heightAccessor(datum);
                item.anchorWidth = this.#anchorWidthAccessor(datum);
                item.anchorHeight = this.#anchorHeightAccessor(datum);
                item.priority = items.length;
            } else {
                initialized = true;
                item = {
                    datum,
                    anchorX,
                    anchorY,
                    x: anchorX,
                    y: anchorY,
                    width: this.#widthAccessor(datum),
                    height: this.#heightAccessor(datum),
                    anchorWidth: this.#anchorWidthAccessor(datum),
                    anchorHeight: this.#anchorHeightAccessor(datum),
                    priority: items.length,
                    displayX: anchorX,
                    displayY: anchorY,
                };
            }
            if (progressive) {
                nextStates.set(key, item);
            }
            items.push(item);
        }
        if (items.length == 0) {
            return undefined;
        }

        const solver = new Displace2DConstraintSolver(items, xExtent, yExtent);
        if (progressive) {
            if (retained) {
                solver.compactTowardAnchors();
            }
            if (initialized) {
                for (let i = 0; i < INITIAL_STEPS; i++) {
                    solver.step();
                }
            }
        } else {
            solver.solve();
        }
        for (const item of items) {
            item.datum[this.#as[0]] =
                (progressive ? item.displayX : item.x) - item.anchorX;
            item.datum[this.#as[1]] =
                (progressive ? item.displayY : item.y) - item.anchorY;
        }

        return progressive ? solver : undefined;
    }

    #placeFacets() {
        // TODO: Whole-batch transforms could share facet iteration while keeping
        // their computation and publication lifecycles transform-specific.
        // File boundaries preserve source metadata, not collision groups.
        this.#relaxations = [];
        const nextStates = this.#keyAccessor ? new Map() : this.#states;
        let facetStart = 0;
        for (const { index, flowBatch } of this.#batchStarts) {
            if (flowBatch.type == "facet") {
                if (index > facetStart) {
                    const relaxation = this.#place(
                        this.#data.slice(facetStart, index),
                        nextStates
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
                facetStart == 0 ? this.#data : this.#data.slice(facetStart),
                nextStates
            );
            if (relaxation) {
                this.#relaxations.push(relaxation);
            }
        }
        this.#states = nextStates;
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
            !this.#animator ||
            this.#animator.transitionsEnabled === false ||
            this.#animationRequested ||
            this.#relaxations.length == 0
        ) {
            return;
        }

        this.#animationRequested = true;
        this.#animator.requestTransition(this.#animate);
    }

    #cancelAnimation() {
        this.#animator?.cancelTransition(this.#animate);
        this.#animationRequested = false;
        this.#lastAnimationTimestamp = undefined;
    }

    /** @param {number} timestamp */
    #animate = (timestamp) => {
        this.#animationRequested = false;
        if (this.disposed) {
            return;
        }

        const elapsed = Math.min(
            50,
            Math.max(
                1,
                this.#lastAnimationTimestamp === undefined
                    ? DEFAULT_FRAME_INTERVAL
                    : timestamp - this.#lastAnimationTimestamp
            )
        );
        this.#lastAnimationTimestamp = timestamp;
        const start = performance.now();
        let solverActive = false;
        for (let i = 0; i < MAX_STEPS_PER_FRAME; i++) {
            solverActive = this.#stepRelaxations();
            if (!solverActive || performance.now() - start >= FRAME_BUDGET) {
                break;
            }
        }

        const displayState = this.#advanceDisplayedPositions(elapsed);
        if (displayState != 0) {
            this.#writeRelaxedOffsets();
            this.#replayChildren();
        }
        if (solverActive || displayState == 2) {
            this.#requestAnimation();
        }
    };

    #stepRelaxations() {
        let active = false;
        for (const relaxation of this.#relaxations) {
            if (relaxation.active) {
                relaxation.step();
            }
            active ||= relaxation.active;
        }
        return active;
    }

    /**
     * @param {number} elapsed
     * @returns {0 | 1 | 2} No change, changed and settled, or still moving.
     */
    #advanceDisplayedPositions(elapsed) {
        const alpha = 1 - 2 ** (-elapsed / DISPLAY_HALF_LIFE);
        let changed = false;
        let pending = false;
        for (const relaxation of this.#relaxations) {
            for (const item of relaxation.items) {
                const placement = /** @type {PlacementItem} */ (item);
                const dx = item.x - placement.displayX;
                const dy = item.y - placement.displayY;
                if (dx != 0) {
                    placement.displayX +=
                        Math.abs(dx) <= DISPLAY_EPSILON
                            ? dx
                            : clamp(
                                  dx * alpha,
                                  -MAX_DISPLAY_STEP,
                                  MAX_DISPLAY_STEP
                              );
                    changed = true;
                }
                if (dy != 0) {
                    placement.displayY +=
                        Math.abs(dy) <= DISPLAY_EPSILON
                            ? dy
                            : clamp(
                                  dy * alpha,
                                  -MAX_DISPLAY_STEP,
                                  MAX_DISPLAY_STEP
                              );
                    changed = true;
                }
                pending ||=
                    Math.abs(item.x - placement.displayX) > DISPLAY_EPSILON ||
                    Math.abs(item.y - placement.displayY) > DISPLAY_EPSILON;
            }
        }
        return changed ? (pending ? 2 : 1) : 0;
    }

    #writeRelaxedOffsets() {
        for (const relaxation of this.#relaxations) {
            for (const item of relaxation.items) {
                const placement = /** @type {PlacementItem} */ (item);
                item.datum[this.#as[0]] = placement.displayX - item.anchorX;
                item.datum[this.#as[1]] = placement.displayY - item.anchorY;
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
            (!this.#scalePositions || this.#hasScaleLayout())
        );
    }

    /** @param {number} [wait] */
    #scheduleReplay(wait = this.#debounce) {
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
 * @returns {DimensionAccessor}
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

/** @param {any} key */
function validateKey(key) {
    if (
        typeof key != "string" &&
        !(typeof key == "number" && Number.isFinite(key))
    ) {
        throw new Error("displace2d keys must be strings or finite numbers.");
    }
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
