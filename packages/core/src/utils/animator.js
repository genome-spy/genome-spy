import doTransition from "./transition";

export default class Animator {
    /**
     *
     * @param {function(number):void} renderCallback
     */
    constructor(renderCallback) {
        this._renderCallback = renderCallback;
        this._renderRequested = false;
        this._warn = false;

        /** @type {(function(number):void)[]} */
        this.transitions = [];
    }

    /**
     * Schedules a "transition" to be called before the actual rendering
     * is preformed. The transition could adjust the layout, for example.
     * This method also requests rendering to be performed.
     *
     * If the callback has already been requested (compared by identity),
     * it is removed from the queue and added to the end.
     *
     * @param {function(number):void} callback
     */
    requestTransition(callback) {
        this.cancelTransition(callback);
        this.transitions.push(callback);
        this.requestRender();
    }

    /**
     * @param {function(number):void} callback
     */
    cancelTransition(callback) {
        const existingIndex = this.transitions.indexOf(callback);
        if (existingIndex >= 0) {
            this.transitions.splice(existingIndex, 1);
        }
    }

    /**
     * Requests the request transitions and rendering callback to be called
     * during the next animation frame. Redundant calls to this method are safe,
     * they have no effect.
     */
    requestRender() {
        if (!this._renderRequested) {
            this._renderRequested = true;
            window.requestAnimationFrame((timestamp) => {
                this._renderRequested = false;

                const transitions = this.transitions;
                this.transitions = [];

                /** @type {function} */
                let transitionCallback;
                while ((transitionCallback = transitions.shift())) {
                    transitionCallback(timestamp);
                }

                this._renderCallback(timestamp);
            });
        } else if (this._warn) {
            console.warn("Render already requested!");
        }
    }

    /**
     * Initiates a transition with a `requestAnimationFrame` that is synced
     * with this Animator instance.
     *
     * @param {import("./transition").TransitionOptions} options
     */
    transition(options) {
        return doTransition({
            requestAnimationFrame: (callback) =>
                this.requestTransition(callback),
            ...options,
        });
    }
}
