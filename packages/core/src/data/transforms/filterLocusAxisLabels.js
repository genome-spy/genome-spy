import { BEHAVIOR_COLLECTS } from "../flowNode.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";

/**
 * Filters numeric locus-axis labels that overlap the chromosome label rendered
 * inside the same chromosome interval.
 */
export default class FilterLocusAxisLabelsTransform extends Transform {
    get behavior() {
        return BEHAVIOR_COLLECTS;
    }

    get domainSensitiveScaleChannels() {
        return [this.channel];
    }

    /**
     * @param {import("../../spec/transform.js").FilterLocusAxisLabelsParams} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        super(params, view);

        this.params = params;
        this.channel = params.channel;
        this.labelWidthAccessor = field(params.labelWidth);
        this.chromLabelWidthAccessor = field(params.chromLabelWidth);

        /** @type {import("../flowNode.js").Datum[]} */
        this.data = [];

        /** @type {import("../flowNode.js").Datum[]} */
        this.nextOutputData = [];

        /**
         * Published locus tick datums are uniquely identified by `value`.
         * @type {Set<import("../../spec/channel.js").Scalar>}
         */
        this.outputValueSet = new Set();

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

        const scale =
            /** @type {import("../../genome/scaleLocus.js").ScaleLocus} */ (
                this.resolution.getScale()
            );
        const genome = scale.genome();

        for (const datum of this.data) {
            const chromosome = genome.getChromosome(datum.chromLabel);
            if (!chromosome) {
                throw new Error(
                    "Unknown chromosome on locus axis: " + datum.chromLabel
                );
            }

            const numericBounds = getPointLabelBounds(
                scale(datum.value) * axisLength,
                this.labelWidthAccessor(datum),
                this.params.labelAlign
            );
            const chromosomeStart =
                scale(chromosome.continuousStart) * axisLength;
            const chromosomeEnd = scale(chromosome.continuousEnd) * axisLength;
            const chromosomeBounds = getRangedLabelBounds(
                chromosomeStart,
                chromosomeEnd,
                this.chromLabelWidthAccessor(datum),
                this.params.chromLabelPadding,
                this.params.chromLabelAlign,
                axisLength
            );

            if (
                !boundsOverlap(
                    numericBounds,
                    chromosomeBounds,
                    this.params.labelSpacing
                )
            ) {
                this.nextOutputData.push(datum);
            }
        }

        this.propagateIfChanged();
    }

    propagateIfChanged() {
        const changed =
            !this.hasPublished ||
            this.nextOutputData.length != this.outputValueSet.size ||
            this.nextOutputData.some(
                (datum) => !this.outputValueSet.has(datum.value)
            );

        if (changed) {
            this.outputValueSet.clear();
            for (const datum of this.nextOutputData) {
                this.outputValueSet.add(datum.value);
            }

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
 * @param {"left" | "center" | "right"} align
 */
function getPointLabelBounds(position, width, align) {
    switch (align) {
        case "left":
            return [position, position + width];
        case "center":
            return [position - width / 2, position + width / 2];
        case "right":
            return [position - width, position];
        default:
            throw new Error("Invalid label alignment: " + align);
    }
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
