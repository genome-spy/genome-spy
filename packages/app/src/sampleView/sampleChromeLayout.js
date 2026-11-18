// @ts-check

import { translateAxisCoords } from "@genome-spy/core/view/gridView/gridView.js";
import Padding from "@genome-spy/core/view/layout/padding.js";
import {
    createClipOptions,
    normalizeClipOptions,
} from "@genome-spy/core/view/renderingContext/clipOptions.js";
import { getClosestSampleLocationAt } from "./locationManager.js";

const DEFAULT_MIN_SAMPLE_HEIGHT = 60;
const DEFAULT_MODE = "all";
const MIDDLE_SAMPLE_TIE_EPSILON = 1e-6;

/**
 * Coordinates SampleView-specific chrome around the repeated sample pane.
 *
 */
export default class SampleChromeLayout {
    /**
     * @typedef {import("@genome-spy/core/view/axisView.js").default} AxisView
     * @typedef {{ axisView: AxisView }} AxisCandidate
     * @typedef {import("./sampleViewTypes.js").Locations} Locations
     */

    /** @type {import("@genome-spy/app/spec/sampleView.js").SampleYAxisDef | null | undefined} */
    #sampleYAxis;

    /** @type {(orient: "left" | "right") => AxisCandidate | undefined} */
    #getActiveAxisCandidate;

    /** @type {() => number} */
    #getPeekState;

    /** @type {(() => number) | undefined} */
    #getOverviewSampleHeight;

    /**
     * @param {object} [options]
     * @param {import("@genome-spy/app/spec/sampleView.js").SampleYAxisDef | null} [options.sampleYAxis]
     * @param {(orient: "left" | "right") => AxisCandidate | undefined} [options.getActiveAxisCandidate]
     * @param {() => number} [options.getPeekState]
     * @param {() => number} [options.getOverviewSampleHeight]
     */
    constructor(options = {}) {
        this.#sampleYAxis = options.sampleYAxis;
        this.#getActiveAxisCandidate =
            options.getActiveAxisCandidate ?? (() => undefined);
        this.#getPeekState = options.getPeekState ?? (() => 0);
        this.#getOverviewSampleHeight = options.getOverviewSampleHeight;
    }

    /**
     * @param {Locations} [locations]
     * @returns {number}
     */
    getLeftReserve(locations) {
        return this.#getReserve("left", locations);
    }

    /**
     * @param {Locations} [locations]
     * @returns {number}
     */
    getRightReserve(locations) {
        return this.#getReserve("right", locations);
    }

    /**
     * @param {Locations} [locations]
     * @returns {Padding}
     */
    getHorizontalReserve(locations) {
        return new Padding(
            0,
            this.getRightReserve(locations),
            0,
            this.getLeftReserve(locations)
        );
    }

    /**
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} plotCoords
     * @param {Locations} [locations]
     * @returns {import("@genome-spy/core/view/layout/rectangle.js").default}
     */
    getPlotCoords(plotCoords, locations) {
        const left = this.getLeftReserve(locations);
        const right = this.getRightReserve(locations);

        if (!left && !right) {
            return plotCoords;
        }

        return plotCoords.modify({
            x: () => plotCoords.x + left,
            width: () => plotCoords.width - left - right,
        });
    }

    /**
     * @param {import("@genome-spy/core/view/renderingContext/viewRenderingContext.js").default} context
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} plotCoords
     * @param {Locations} [locations]
     * @param {import("@genome-spy/core/types/rendering.js").RenderingOptions} [options]
     */
    arrangeVerticalAxes(context, plotCoords, locations, options = {}) {
        if (!this.#isEnabled(locations) || this.#getPeekState() !== 0) {
            return;
        }

        const inheritedClip = normalizeClipOptions(options);
        const axisOptions = inheritedClip
            ? {
                  ...options,
                  clip: createClipOptions(inheritedClip.rect, false, true),
              }
            : options;

        for (const orient of /** @type {const} */ (["left", "right"])) {
            const axisView = this.#getAxisView(orient);
            if (!axisView) {
                continue;
            }

            for (const sample of this.#selectTargets(locations)) {
                const sampleCoords = plotCoords.modify({
                    y: () => plotCoords.y + sample.locSize.location,
                    height: sample.locSize.size,
                });

                axisView.arrange(
                    context,
                    translateAxisCoords(sampleCoords, orient, axisView),
                    axisOptions
                );
            }
        }
    }

    /**
     * @param {"left" | "right"} orient
     * @param {Locations} [locations]
     * @returns {number}
     */
    #getReserve(orient, locations) {
        if (!this.#isEnabled(locations)) {
            return 0;
        }

        const axisView = this.#getAxisView(orient);
        if (!axisView) {
            return 0;
        }

        if (axisView.axisProps.placement === "inside") {
            return 0;
        }

        return (
            axisView.getPerpendicularSize() + (axisView.axisProps.offset ?? 0)
        );
    }

    /**
     * @param {"left" | "right"} orient
     * @returns {AxisView | undefined}
     */
    #getAxisView(orient) {
        return this.#getActiveAxisCandidate(orient)?.axisView;
    }

    /**
     * @param {Locations} [locations]
     * @returns {boolean}
     */
    #isEnabled(locations) {
        if (this.#sampleYAxis === null) {
            return false;
        }

        const minSampleHeight =
            this.#sampleYAxis?.minSampleHeight ?? DEFAULT_MIN_SAMPLE_HEIGHT;

        const first = locations?.samples[0];
        return (
            first !== undefined &&
            (this.#getOverviewSampleHeight?.() ?? first.locSize.size) >=
                minSampleHeight
        );
    }

    /**
     * @param {Locations} locations
     * @returns {import("./sampleViewTypes.js").SampleLocation[]}
     */
    #selectTargets(locations) {
        const samples = locations.samples;

        switch (this.#sampleYAxis?.mode ?? DEFAULT_MODE) {
            case "all":
                return samples;
            case "top":
                return samples.slice(0, 1);
            case "middle": {
                const first = samples[0];
                const last = samples.at(-1);
                const midpoint =
                    (first.locSize.location +
                        last.locSize.location +
                        last.locSize.size) /
                    2;

                return [
                    /** @type {import("./sampleViewTypes.js").SampleLocation} */ (
                        getClosestSampleLocationAt(
                            midpoint,
                            samples,
                            MIDDLE_SAMPLE_TIE_EPSILON
                        )
                    ),
                ];
            }
            case "bottom":
                return samples.slice(-1);
            default:
                throw new Error(
                    `Invalid sampleYAxis mode: ${this.#sampleYAxis?.mode}`
                );
        }
    }
}
