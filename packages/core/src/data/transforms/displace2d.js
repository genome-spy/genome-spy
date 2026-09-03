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
 * @prop {number} width
 * @prop {number} height
 * @prop {number} anchorWidth
 * @prop {number} anchorHeight
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
    #bootstrapReplayPending = false;
    #scaleReplayPending = false;
    #repropagating = false;

    /** @type {import("../../scales/scaleResolution.js").default} */
    #xScaleResolution;

    /** @type {import("../../scales/scaleResolution.js").default} */
    #yScaleResolution;

    /** @type {import("../flowNode.js").Datum[]} */
    #data = [];

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

        if (
            params.scalePositions !== undefined &&
            typeof params.scalePositions != "boolean"
        ) {
            throw new Error("displace2d scalePositions must be a boolean.");
        }
        this.scalePositions = params.scalePositions ?? false;
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

        const as = params.as ?? ["xDisplacement", "yDisplacement"];
        if (
            !Array.isArray(as) ||
            as.length != 2 ||
            typeof as[0] != "string" ||
            typeof as[1] != "string" ||
            as[0] == as[1]
        ) {
            throw new Error(
                "displace2d as must contain two distinct output field names."
            );
        }
        this.as = as;
        this.xAccessor = field(params.x);
        this.yAccessor = field(params.y);

        this.width = typeof params.width == "number" ? params.width : 0;
        this.height = typeof params.height == "number" ? params.height : 0;
        this.anchorWidth =
            typeof params.anchorWidth == "number" ? params.anchorWidth : 0;
        this.anchorHeight =
            typeof params.anchorHeight == "number" ? params.anchorHeight : 0;
        this.usesAnchorObstacles =
            params.anchorWidth !== undefined &&
            params.anchorHeight !== undefined;
        this.xPositionFactor = isExprRef(params.xPositionFactor)
            ? 1
            : (params.xPositionFactor ?? 1);
        this.yPositionFactor = isExprRef(params.yPositionFactor)
            ? 1
            : (params.yPositionFactor ?? 1);
        this.xExtent = isExprRef(params.xExtent) ? undefined : params.xExtent;
        this.yExtent = isExprRef(params.yExtent) ? undefined : params.yExtent;

        this.widthAccessor =
            typeof params.width == "string"
                ? field(params.width)
                : () => this.width;
        this.heightAccessor =
            typeof params.height == "string"
                ? field(params.height)
                : () => this.height;
        this.anchorWidthAccessor =
            typeof params.anchorWidth == "string"
                ? field(params.anchorWidth)
                : () => this.anchorWidth;
        this.anchorHeightAccessor =
            typeof params.anchorHeight == "string"
                ? field(params.anchorHeight)
                : () => this.anchorHeight;

        const placementProps = {
            width: typeof params.width == "string" ? this.width : params.width,
            height:
                typeof params.height == "string" ? this.height : params.height,
            anchorWidth:
                typeof params.anchorWidth == "string"
                    ? this.anchorWidth
                    : (params.anchorWidth ?? 0),
            anchorHeight:
                typeof params.anchorHeight == "string"
                    ? this.anchorHeight
                    : (params.anchorHeight ?? 0),
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

            if (
                this.#refreshPlacementParameters() &&
                this.completed &&
                !this.#bootstrapReplayPending
            ) {
                this.#repropagateIfReady();
            }
        };

        this.#placementProps = hasReactiveProps
            ? /** @type {any} */ (
                  activateExprRefProps(
                      this.paramRuntime,
                      placementProps,
                      placementChanged,
                      (disposer) => this.registerDisposer(disposer),
                      { batchMode: "whenPropagated" }
                  )
              )
            : /** @type {any} */ (placementProps);

        if (this.#placementBootstrapped) {
            this.#refreshPlacementParameters();
        }

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

            const scaleChanged = () => this.#scheduleScaleReplay();
            this.#xScaleResolution.addEventListener("domain", scaleChanged);
            this.#yScaleResolution.addEventListener("domain", scaleChanged);
            this.registerDisposer(() => {
                this.#xScaleResolution.removeEventListener(
                    "domain",
                    scaleChanged
                );
                this.#yScaleResolution.removeEventListener(
                    "domain",
                    scaleChanged
                );
            });
            this.registerDisposer(
                view._addBroadcastHandler("layoutComputed", scaleChanged)
            );
        }
    }

    complete() {
        const data = this.#data;

        if (!this.#placementBootstrapped) {
            // Establish data-driven scale domains before reading the scales.
            for (const datum of data) {
                datum[this.as[0]] = 0;
                datum[this.as[1]] = 0;
                this._propagate(datum);
            }
            super.complete();
            data.length = 0;

            this.#refreshPlacementParameters();
            this.#placementBootstrapped = true;
            this.#bootstrapReplayPending = true;
            queueMicrotask(() => {
                this.#bootstrapReplayPending = false;
                if (!this.disposed) {
                    this.#refreshPlacementParameters();
                    this.#repropagateIfReady();
                }
            });
            return;
        }

        if (this.scalePositions && !this.#hasScaleLayout()) {
            for (const datum of data) {
                datum[this.as[0]] = 0;
                datum[this.as[1]] = 0;
                this._propagate(datum);
            }
            super.complete();
            data.length = 0;
            return;
        }

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
                : this.xAccessor(datum) * this.xPositionFactor;
            yPositions[i] = this.scalePositions
                ? yScale(this.yAccessor(datum)) * yAxisLength
                : this.yAccessor(datum) * this.yPositionFactor;
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
                : scaleExtent(this.xExtent, this.xPositionFactor),
            this.scalePositions
                ? [0, yAxisLength]
                : scaleExtent(this.yExtent, this.yPositionFactor),
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

            this._propagate(datum);
        }

        super.complete();
        data.length = 0;
    }

    #refreshPlacementParameters() {
        const props = this.#placementProps;
        validatePlacementParameters(props);

        const placementChanged =
            props.width != this.width ||
            props.height != this.height ||
            props.anchorWidth != this.anchorWidth ||
            props.anchorHeight != this.anchorHeight ||
            props.xPositionFactor != this.xPositionFactor ||
            props.yPositionFactor != this.yPositionFactor ||
            !equalExtent(props.xExtent, this.xExtent) ||
            !equalExtent(props.yExtent, this.yExtent);

        this.width = props.width;
        this.height = props.height;
        this.anchorWidth = props.anchorWidth;
        this.anchorHeight = props.anchorHeight;
        this.xPositionFactor = props.xPositionFactor;
        this.yPositionFactor = props.yPositionFactor;
        this.xExtent = copyExtent(props.xExtent);
        this.yExtent = copyExtent(props.yExtent);

        return placementChanged;
    }

    #hasScaleLayout() {
        return (
            this.#xScaleResolution.getAxisLength() > 0 &&
            this.#yScaleResolution.getAxisLength() > 0
        );
    }

    #repropagateIfReady() {
        if (
            this.#placementBootstrapped &&
            !this.#bootstrapReplayPending &&
            !this.disposed &&
            this.completed &&
            (!this.scalePositions || this.#hasScaleLayout())
        ) {
            this.#repropagating = true;
            try {
                this.repropagate();
            } finally {
                this.#repropagating = false;
            }
        }
    }

    #scheduleScaleReplay() {
        // Domain publication during our own replay is not a new scale change.
        // Coalesce external x/y domain and layout changes into one later replay.
        if (!this.#repropagating && !this.#scaleReplayPending) {
            this.#scaleReplayPending = true;
            queueMicrotask(() => {
                this.#scaleReplayPending = false;
                this.#repropagateIfReady();
            });
        }
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

/**
 * @param {PlacementProps} props
 */
function validatePlacementParameters(props) {
    if (
        !Number.isFinite(props.xPositionFactor) ||
        !Number.isFinite(props.yPositionFactor)
    ) {
        throw new Error("displace2d position factors must be finite numbers.");
    }
    if (
        !Number.isFinite(props.width) ||
        !Number.isFinite(props.height) ||
        !Number.isFinite(props.anchorWidth) ||
        !Number.isFinite(props.anchorHeight) ||
        props.width < 0 ||
        props.height < 0 ||
        props.anchorWidth < 0 ||
        props.anchorHeight < 0
    ) {
        throw new Error(
            "displace2d scalar dimensions must be finite non-negative numbers."
        );
    }
    validateExtent(props.xExtent, "xExtent");
    validateExtent(props.yExtent, "yExtent");
}

/**
 * @param {[number, number] | undefined} extent
 * @param {string} name
 */
function validateExtent(extent, name) {
    if (
        extent !== undefined &&
        (!Array.isArray(extent) ||
            extent.length != 2 ||
            !Number.isFinite(extent[0]) ||
            !Number.isFinite(extent[1]) ||
            extent[0] > extent[1])
    ) {
        throw new Error(
            `displace2d ${name} must contain finite ascending bounds.`
        );
    }
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

/**
 * @param {[number, number] | undefined} first
 * @param {[number, number] | undefined} second
 */
function equalExtent(first, second) {
    return first?.[0] == second?.[0] && first?.[1] == second?.[1];
}

/**
 * @param {[number, number] | undefined} extent
 * @returns {[number, number] | undefined}
 */
function copyExtent(extent) {
    return extent ? [extent[0], extent[1]] : undefined;
}
