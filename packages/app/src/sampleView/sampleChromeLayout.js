// @ts-check

import { translateAxisCoords } from "@genome-spy/core/view/gridView/gridView.js";
import Padding from "@genome-spy/core/view/layout/padding.js";

const DEFAULT_MIN_SAMPLE_HEIGHT = 60;
const DEFAULT_MODE = "all";

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

    /**
     * @param {object} [options]
     * @param {import("@genome-spy/app/spec/sampleView.js").SampleYAxisDef | null} [options.sampleYAxis]
     * @param {(orient: "left" | "right") => AxisCandidate | undefined} [options.getActiveAxisCandidate]
     * @param {() => number} [options.getPeekState]
     */
    constructor(options = {}) {
        this.#sampleYAxis = options.sampleYAxis;
        this.#getActiveAxisCandidate =
            options.getActiveAxisCandidate ?? (() => undefined);
        this.#getPeekState = options.getPeekState ?? (() => 0);
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
     * @param {Locations} [previousLocations]
     * @param {Locations} [nextLocations]
     * @returns {boolean}
     */
    hasHorizontalReserveChanged(previousLocations, nextLocations) {
        return (
            this.getLeftReserve(previousLocations) !==
                this.getLeftReserve(nextLocations) ||
            this.getRightReserve(previousLocations) !==
                this.getRightReserve(nextLocations)
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
    renderVerticalAxes(context, plotCoords, locations, options = {}) {
        if (!this.#isEnabled(locations) || this.#getPeekState() !== 0) {
            return;
        }

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

                axisView.render(
                    context,
                    translateAxisCoords(sampleCoords, orient, axisView),
                    options
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

        return (
            locations?.samples.some(
                (sample) => sample.locSize.size >= minSampleHeight
            ) ?? false
        );
    }

    /**
     * @param {Locations} locations
     * @returns {import("./sampleViewTypes.js").SampleLocation[]}
     */
    #selectTargets(locations) {
        const minSampleHeight =
            this.#sampleYAxis?.minSampleHeight ?? DEFAULT_MIN_SAMPLE_HEIGHT;
        const eligible = locations.samples.filter(
            (sample) => sample.locSize.size >= minSampleHeight
        );

        switch (this.#sampleYAxis?.mode ?? DEFAULT_MODE) {
            case "all":
                return eligible;
            case "top":
                return eligible.slice(0, 1);
            case "middle": {
                if (!eligible.length) {
                    return [];
                }

                const first = locations.samples[0];
                const last = locations.samples.at(-1);
                const midpoint =
                    first && last
                        ? (first.locSize.location +
                              last.locSize.location +
                              last.locSize.size) /
                          2
                        : 0;

                let closest = eligible[0];
                let closestDistance = Infinity;
                for (const sample of eligible) {
                    const center =
                        sample.locSize.location + sample.locSize.size / 2;
                    const distance = Math.abs(center - midpoint);
                    if (distance < closestDistance) {
                        closest = sample;
                        closestDistance = distance;
                    }
                }

                return [closest];
            }
            case "bottom":
                return eligible.slice(-1);
            default:
                throw new Error(
                    `Invalid sampleYAxis mode: ${this.#sampleYAxis?.mode}`
                );
        }
    }
}
