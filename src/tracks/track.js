/**
 * Abstract base class for tracks
 */
export default class Track {

    /**
     * @param {import("../genomeSpy").default} genomeSpy 
     * @param {object} [config]
     */
    constructor(genomeSpy, config) {
        this.config = config || {};
        this.genomeSpy = genomeSpy
    }

    /**
     * @param {HTMLElement} trackContainer 
     */
    async initialize(trackContainer) {
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

    /**
     * Returns the domain of the data that is being laid on the x axis of the track.
     * Returns undefined if the track does not have data.
     * 
     * @return {void | import("../utils/interval").default}
     */
    getXDomain() { }

    createCanvas() {
        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        this.trackContainer.appendChild(canvas);
        return canvas;
    }

    /**
     * 
     * @param {HTMLCanvasElement} canvas 
     * @param {Interval} interval 
     * @param {number} [trackHeight]
     */
    adjustCanvas(canvas, interval, trackHeight) {
        const r = window.devicePixelRatio || 1;

        const height = trackHeight || this.trackContainer.clientHeight;

        const px = x => `${x}px`;
        canvas.style.left = px(interval.lower);
        canvas.style.width = px(interval.width());
        canvas.style.height = px(height);

        canvas.width = interval.width() * r;
        canvas.height = height * r;
    }

    /**
     * @returns {CanvasRenderingContext2D}
     */
    get2d(canvas) {
        // TODO: Consider moving to some utility module

        const r = window.devicePixelRatio || 1;
        const ctx = canvas.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(r, r);
        return ctx;
    }

    /**
     * Returns an interval that matches the search string
     * 
     * @param {string} string What to search
     */
    search(string) {
        return null;
    }
    
    /**
     * Returns search instructions for this track as HTML
     */
    searchHelp() {
        return "";
    }
}