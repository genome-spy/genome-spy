export default class Animator {
    /**
     *
     * @param {function(number):void} renderCallback
     */
    constructor(renderCallback) {
        this._renderCallback = renderCallback;
        this._renderRequested = false;
        this._warn = false;
    }

    requestRender() {
        if (!this._renderRequested) {
            this._renderRequested = true;
            window.requestAnimationFrame(timestamp => {
                this._renderRequested = false;
                this._renderCallback(timestamp);
            });
        } else if (this._warn) {
            console.warn("Render already requested!");
        }
    }
}
