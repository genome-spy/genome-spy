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
     *
     * @param {function(number):void} callback
     */
    requestTransition(callback) {
        this.transitions.push(callback);
        this.requestRender();
    }

    requestRender() {
        if (!this._renderRequested) {
            this._renderRequested = true;
            window.requestAnimationFrame(timestamp => {
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
}
