// @ts-check

const DEFAULT_MIN_SAMPLE_HEIGHT = 50;

/**
 * Coordinates SampleView-specific chrome around the repeated sample pane.
 *
 * The initial implementation is intentionally a no-op boundary. Later steps
 * will add vertical axis lanes without adding that policy to SampleView.
 */
export default class SampleChromeLayout {
    /**
     * @typedef {import("@genome-spy/core/view/axisView.js").default} AxisView
     * @typedef {import("./sampleViewTypes.js").Locations} Locations
     */

    /** @type {import("@genome-spy/app/spec/sampleView.js").SpecYAxisDef | undefined} */
    #specYAxis;

    /** @type {() => Partial<Record<"left" | "right", AxisView>>} */
    #getAxes;

    /** @type {() => number} */
    #getPeekState;

    /**
     * @param {object} [options]
     * @param {import("@genome-spy/app/spec/sampleView.js").SpecYAxisDef} [options.specYAxis]
     * @param {() => Partial<Record<"left" | "right", AxisView>>} [options.getAxes]
     * @param {() => number} [options.getPeekState]
     */
    constructor(options = {}) {
        this.#specYAxis = options.specYAxis;
        this.#getAxes = options.getAxes ?? (() => ({}));
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
     * @param {import("@genome-spy/core/view/renderingContext/viewRenderingContext.js").default | object} context
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} plotCoords
     * @param {import("@genome-spy/core/types/rendering.js").RenderingOptions} [options]
     */
    renderVerticalAxes(context, plotCoords, options = {}) {
        // No-op until vertical axis lanes are added.
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

        const axisView = this.#getAxes()[orient];
        if (!axisView) {
            return 0;
        }

        return (
            axisView.getPerpendicularSize() + (axisView.axisProps.offset ?? 0)
        );
    }

    /**
     * @param {Locations} [locations]
     * @returns {boolean}
     */
    #isEnabled(locations) {
        if (!this.#specYAxis || this.#specYAxis.mode === "none") {
            return false;
        }

        if (this.#getPeekState() !== 0) {
            return false;
        }

        const minSampleHeight =
            this.#specYAxis.minSampleHeight ?? DEFAULT_MIN_SAMPLE_HEIGHT;

        return (
            locations?.samples.some(
                (sample) => sample.locSize.size >= minSampleHeight
            ) ?? false
        );
    }
}
