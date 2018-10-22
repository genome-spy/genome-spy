/**
 * Abstract base class for tracks
 */
export default class Track {

    createCanvas() {
        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        this.trackContainer.appendChild(canvas);
        return canvas;
    }

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

}