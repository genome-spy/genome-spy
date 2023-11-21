/**
 * This class wraps a MouseEvent (or similar) and allows for
 * its propagation through the view hierarchy in a similar manner
 * as in the DOM.
 */
export default class InteractionEvent {
    /**
     *
     * @param {import("../view/layout/point.js").default} point Event coordinates
     *      inside the visualization canvas.
     * @param {UIEvent} uiEvent The event to be wrapped
     */
    constructor(point, uiEvent) {
        this.point = point;
        this.uiEvent = uiEvent;
        this.stopped = false;

        /**
         * The target is known only in the bubbling phase
         *
         * @type {import("../view/view.js").default}
         */
        this.target = undefined;
    }

    stopPropagation() {
        this.stopped = true;
    }

    get type() {
        return this.uiEvent.type;
    }
}
