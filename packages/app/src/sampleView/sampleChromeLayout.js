// @ts-check

/**
 * Coordinates SampleView-specific chrome around the repeated sample pane.
 *
 * The initial implementation is intentionally a no-op boundary. Later steps
 * will add vertical axis lanes without adding that policy to SampleView.
 */
export default class SampleChromeLayout {
    /**
     * @returns {number}
     */
    getLeftReserve() {
        return 0;
    }

    /**
     * @returns {number}
     */
    getRightReserve() {
        return 0;
    }

    /**
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} plotCoords
     * @returns {import("@genome-spy/core/view/layout/rectangle.js").default}
     */
    getPlotCoords(plotCoords) {
        return plotCoords;
    }

    /**
     * @param {import("@genome-spy/core/view/renderingContext/viewRenderingContext.js").default | object} context
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} plotCoords
     * @param {import("@genome-spy/core/types/rendering.js").RenderingOptions} [options]
     */
    renderVerticalAxes(context, plotCoords, options = {}) {
        // No-op until vertical axis lanes are added.
    }
}
