import Interval from "../utils/interval";

/**
 * Abstract base class for tracks
 */
export default class Track {

    initialize({genomeSpy, trackContainer}) {
        this.genomeSpy = genomeSpy;
        this.trackContainer = trackContainer;
    }

    /**
     * Returns the minimum width that accommodates the labels on the Y axis.
     * The axis area of sampleTrack contains sample labels and sample-specific
     * variables.
     * 
     * @returns {number} The width
     */
    getMinAxisWidth() {
        return 0;
    }

    createCanvas() {
        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        this.trackContainer.appendChild(canvas);
        return canvas;
    }

    adjustCanvas(canvas, interval) {
		const trackHeight = this.trackContainer.clientHeight;

        canvas.style.left = `${interval.lower}px`;
        canvas.width = interval.width();
        canvas.height = trackHeight;
    }

    getViewportDomain() {
        // Could be in GenomeSpy too ... TODO: Decide
        return Interval.fromArray(this.genomeSpy.getVisibleDomain());
    }

    /**
     * Returns an interval that matches the search string
     * 
     * @param {string} string What to search
     */
    search(string) {
        return null;
    }
}