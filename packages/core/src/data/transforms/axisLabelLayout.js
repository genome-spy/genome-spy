import { isLogarithmic } from "vega-scale";
import { BEHAVIOR_COLLECTS, BEHAVIOR_MODIFIES } from "../flowNode.js";
import { field } from "../../utils/field.js";
import { removeOverlappingAxisLabels } from "./axisLabelOverlap.js";
import Transform from "./transform.js";

/**
 * Lays out axis labels after their text has been measured. Chromosome-label
 * conflicts remove the complete tick datum, while ordinary label overlaps only
 * change the label visibility field.
 */
export default class AxisLabelLayoutTransform extends Transform {
    get behavior() {
        return BEHAVIOR_COLLECTS | BEHAVIOR_MODIFIES;
    }

    get domainSensitiveScaleChannels() {
        return [this.channel];
    }

    /**
     * @param {import("../../spec/transform.js").AxisLabelLayoutParams} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super(params, view);

        this.params = params;
        this.channel = params.channel;
        this.labelWidthAccessor = field(params.labelWidth);
        this.chromLabelWidthAccessor = params.chromLabelWidth
            ? field(params.chromLabelWidth)
            : undefined;

        if (params.labelOverlap && !isAxisAligned(params.labelAngle)) {
            throw new Error(
                "Axis label overlap removal requires an axis-aligned label angle."
            );
        }

        /** @type {import("../flowNode.js").Datum[]} */
        this.data = [];

        /** @type {import("../flowNode.js").Datum[]} */
        this.nextOutputData = [];

        /**
         * Published locus tick datums are uniquely identified by `value`.
         * @type {Set<import("../../spec/channel.js").Scalar>}
         */
        this.outputValueSet = new Set();

        /** @type {Set<import("../../spec/channel.js").Scalar>} */
        this.visibleLabelValueSet = new Set();

        this.hasPublished = false;

        this.resolution = view.getScaleResolution(this.channel);
        const filterAndPropagate = () => this.filterAndPropagate();
        this.schedule = () =>
            view.context.animator.requestTransition(filterAndPropagate);

        const domainListener = () => this.filterAndPropagate();
        this.resolution.addEventListener("domain", domainListener);
        this.registerDisposer(() =>
            this.resolution.removeEventListener("domain", domainListener)
        );

        this.registerDisposer(
            view._addBroadcastHandler("layoutComputed", this.schedule)
        );
    }

    complete() {
        if (this.resolution.getAxisLength()) {
            this.filterAndPropagate();
        } else {
            this.schedule();
            if (this.hasPublished) {
                this.completed = true;
            } else {
                this.propagateIfChanged();
            }
        }
    }

    filterAndPropagate() {
        const axisLength = this.resolution.getAxisLength();
        if (!axisLength) {
            return;
        }

        this.nextOutputData.length = 0;

        const scale = this.resolution.getScale();
        const genome = this.chromLabelWidthAccessor
            ? /** @type {import("../../genome/scaleLocus.js").ScaleLocus} */ (
                  scale
              ).genome()
            : undefined;

        for (const datum of this.data) {
            if (
                !genome ||
                !this.chromosomeLabelOverlaps(datum, scale, genome, axisLength)
            ) {
                this.nextOutputData.push(datum);
            }
        }

        const method = this.getOverlapMethod(scale);
        const visibleData = method
            ? removeOverlappingAxisLabels(
                  this.nextOutputData,
                  (datum) =>
                      getAxisLabelBounds(
                          scale(datum.value) * axisLength,
                          this.labelWidthAccessor(datum),
                          this.params.labelFontSize,
                          this.params.labelAngle,
                          this.channel,
                          this.params.labelAlign,
                          this.params.labelBaseline
                      ),
                  method,
                  this.params.labelSeparation
              )
            : this.nextOutputData;
        const nextVisibleValueSet = new Set(
            visibleData.map((datum) => datum.value)
        );

        for (const datum of this.nextOutputData) {
            datum[this.params.labelVisible] = nextVisibleValueSet.has(
                datum.value
            );
        }

        this.propagateIfChanged(nextVisibleValueSet);
    }

    /**
     * @param {Set<import("../../spec/channel.js").Scalar>} nextVisibleValueSet
     */
    propagateIfChanged(nextVisibleValueSet = new Set()) {
        const changed =
            !this.hasPublished ||
            this.nextOutputData.length != this.outputValueSet.size ||
            this.nextOutputData.some(
                (datum) => !this.outputValueSet.has(datum.value)
            ) ||
            !setsEqual(nextVisibleValueSet, this.visibleLabelValueSet);

        if (changed) {
            this.outputValueSet.clear();
            for (const datum of this.nextOutputData) {
                this.outputValueSet.add(datum.value);
            }
            this.visibleLabelValueSet = nextVisibleValueSet;

            super.reset();
            for (const datum of this.nextOutputData) {
                this._propagate(datum);
            }
            this.hasPublished = true;
            super.complete();
        } else {
            this.completed = true;
        }

        this.nextOutputData.length = 0;
    }

    /**
     * @param {import("../flowNode.js").Datum} datum
     * @param {import("../../types/encoder.js").VegaScale} scale
     * @param {import("../../genome/genome.js").default} genome
     * @param {number} axisLength
     */
    chromosomeLabelOverlaps(datum, scale, genome, axisLength) {
        const chromosome = genome.getChromosome(datum.chromLabel);
        const numericBounds = getAxisLabelBounds(
            scale(datum.value) * axisLength,
            this.labelWidthAccessor(datum),
            this.params.labelFontSize,
            this.params.labelAngle,
            this.channel,
            this.params.labelAlign,
            this.params.labelBaseline
        );
        const chromosomeStart = scale(chromosome.continuousStart) * axisLength;
        const chromosomeEnd = scale(chromosome.continuousEnd) * axisLength;
        const chromosomeBounds = getRangedLabelBounds(
            chromosomeStart,
            chromosomeEnd,
            this.chromLabelWidthAccessor(datum),
            this.params.chromLabelPadding,
            this.params.chromLabelAlign,
            axisLength
        );

        return boundsOverlap(
            numericBounds,
            chromosomeBounds,
            this.params.chromLabelSpacing
        );
    }

    /** @param {import("../../types/encoder.js").VegaScale} scale */
    getOverlapMethod(scale) {
        switch (this.params.labelOverlap) {
            case false:
                return false;
            case "auto":
                return isLogarithmic(scale.type) ? "greedy" : "parity";
            case "parity":
            case "greedy":
                return this.params.labelOverlap;
            default:
                throw new Error(
                    "Invalid axis label overlap method: " +
                        this.params.labelOverlap
                );
        }
    }

    reset() {
        // Keep descendants intact until the replacement output set is known.
        this.completed = false;
        this.data.length = 0;
        this.nextOutputData.length = 0;
    }

    /** @param {import("../flowNode.js").Datum} datum */
    handle(datum) {
        this.data.push(datum);
    }
}

/**
 * @param {number} position
 * @param {number} width
 * @param {number} height
 * @param {number} angle
 * @param {"x" | "y"} channel
 * @param {"left" | "center" | "right"} align
 * @param {"alphabetic" | "baseline" | "top" | "middle" | "bottom"} baseline
 * @returns {[number, number]}
 */
export function getAxisLabelBounds(
    position,
    width,
    height,
    angle,
    channel,
    align,
    baseline
) {
    const x1 = -getAlignmentFactor(align) * width;
    const x2 = x1 + width;
    const y1 = -getBaselineFactor(baseline) * height;
    const y2 = y1 + height;
    const radians = (-angle * Math.PI) / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const a = channel == "x" ? x1 * cos - y1 * sin : x1 * sin + y1 * cos;
    const b = channel == "x" ? x2 * cos - y1 * sin : x2 * sin + y1 * cos;
    const c = channel == "x" ? x2 * cos - y2 * sin : x2 * sin + y2 * cos;
    const d = channel == "x" ? x1 * cos - y2 * sin : x1 * sin + y2 * cos;

    return [position + Math.min(a, b, c, d), position + Math.max(a, b, c, d)];
}

/** @param {"left" | "center" | "right"} align */
function getAlignmentFactor(align) {
    switch (align) {
        case "left":
            return 0;
        case "center":
            return 0.5;
        case "right":
            return 1;
        default:
            throw new Error("Invalid label alignment: " + align);
    }
}

/**
 * @param {"alphabetic" | "baseline" | "top" | "middle" | "bottom"} baseline
 */
function getBaselineFactor(baseline) {
    switch (baseline) {
        case "top":
            return 0;
        case "middle":
            return 0.5;
        case "bottom":
        case "alphabetic":
        case "baseline":
            return 1;
        default:
            throw new Error("Invalid label baseline: " + baseline);
    }
}

/** @param {number} angle */
function isAxisAligned(angle) {
    return angle % 90 == 0;
}

/**
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 */
function setsEqual(a, b) {
    return a.size == b.size && a.isSubsetOf(b);
}

/**
 * Conservatively approximates a ranged text mark using its visible chromosome
 * interval. A squeezed label occupies the whole visible interval. Partially
 * visible text is kept inside the viewport, which may cull one extra numeric
 * label but cannot leave an overlap.
 *
 * @param {number} start
 * @param {number} end
 * @param {number} width
 * @param {number} padding
 * @param {"left" | "center" | "right"} align
 * @param {number} viewportLength
 */
export function getRangedLabelBounds(
    start,
    end,
    width,
    padding,
    align,
    viewportLength
) {
    const rangeStart = Math.min(start, end);
    const rangeEnd = Math.max(start, end);
    const span = rangeEnd - rangeStart;
    const visibleStart = Math.max(0, rangeStart);
    const visibleEnd = Math.min(viewportLength, rangeEnd);
    const paddedWidth = width + 2 * padding;
    const availableSpan = span - padding;

    if (paddedWidth > availableSpan) {
        return [visibleStart, visibleEnd];
    }

    switch (align) {
        case "left": {
            const anchor = visibleStart + padding;
            return [anchor, anchor + width];
        }
        case "center": {
            const anchor = Math.max(
                width / 2,
                Math.min(
                    viewportLength - width / 2,
                    (visibleStart + visibleEnd) / 2
                )
            );
            return [anchor - width / 2, anchor + width / 2];
        }
        case "right": {
            const anchor = visibleEnd - padding;
            return [anchor - width, anchor];
        }
        default:
            throw new Error("Invalid chromosome label alignment: " + align);
    }
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} spacing
 */
function boundsOverlap(a, b, spacing) {
    return a[0] < b[1] + spacing && b[0] - spacing < a[1];
}
