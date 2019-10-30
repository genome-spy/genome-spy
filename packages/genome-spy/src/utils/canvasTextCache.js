/**
 * Cache for text rendering
 * 
 * TODO: Allow specifying a list of font sizes that should be cached
 */
export default class CanvasTextCache {
    /**
     * 
     * @param {number} fontSize 
     * @param {string} fontFamily 
     */
    constructor(fontSize, fontFamily) {
        this.fontSize = fontSize;
        this.fontFamily = fontFamily;

        /** @type {Map<string, HTMLCanvasElement>} */
        this.cache = new Map();

        /** Relative padding above and below the text */
        this.vPadding = 0.0;

        this._dpr = window.devicePixelRatio || 1;

        this.measureContext = document.createElement("canvas").getContext("2d");
        this.measureContext.font = `${this.fontSize}px ${this.fontFamily}`;
        this.measureContext.textBaseline = 'middle';
    }
    
    /**
     * 
     * @param {string} text 
     */
    _getText(text) {
        let canvas = this.cache.get(text);
        if (!canvas) {
            canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const width = this.measureContext.measureText(text).width;
            canvas.height = Math.ceil(this._getTextHeight() * this._dpr);
            canvas.width = Math.ceil(width * this._dpr);
            
            ctx.scale(this._dpr, this._dpr);
            ctx.font = `${this.fontSize}px ${this.fontFamily}`;
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 0, Math.round(this._getTextHeight() / 2));

            this.cache.set(text, canvas);
        }

        return canvas;
    }

    _getTextHeight() {
        return this.fontSize * (1 + 2 * this.vPadding);
    }

    /**
     * 
     * @param {CanvasRenderingContext2D} targetCtx
     * @param {string} text 
     * @param {number} x 
     * @param {number} y 
     * @param {?number} fontSize
     */
    fillText(targetCtx, text, x, y, fontSize = null) {
        const scaleFactor = (fontSize ? (fontSize / this.fontSize) : 1) / this._dpr;

        const textCanvas = this._getText(text);
        const targetHeight = textCanvas.height * scaleFactor;
        const targetWidth = textCanvas.width * scaleFactor;

        targetCtx.drawImage(textCanvas,
            x, Math.round(y - targetHeight / 2),
            targetWidth, targetHeight);
    }

    clearCache() {
        this.cache = new Map();
        this._dpr = window.devicePixelRatio || 1;
    }

}