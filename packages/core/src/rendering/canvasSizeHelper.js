/**
 * Handles logical/physical canvas size calculations and optional
 * device-pixel-content-box observation.
 */
export default class CanvasSizeHelper {
    /**
     * @param {HTMLElement} container
     * @param {HTMLCanvasElement} canvas
     * @param {() => {width: number, height: number}} sizeSource
     * @param {() => void} [onPhysicalSizeChange]
     */
    constructor(container, canvas, sizeSource, onPhysicalSizeChange) {
        this._container = container;
        this._canvas = canvas;
        this._sizeSource = sizeSource;
        this._onPhysicalSizeChange = onPhysicalSizeChange ?? (() => {});

        /**
         * @type {{ width: number, height: number } | undefined}
         */
        this._logicalCanvasSize = undefined;

        /**
         * @type {{ width: number, height: number } | undefined}
         */
        this._devicePixelContentBoxSize = undefined;

        /**
         * @type {ResizeObserver | undefined}
         */
        this._devicePixelContentBoxObserver = undefined;

        this._observeDevicePixelContentBox();
    }

    invalidate() {
        this._logicalCanvasSize = undefined;
        this._devicePixelContentBoxSize = undefined;
    }

    finalize() {
        if (this._devicePixelContentBoxObserver) {
            this._devicePixelContentBoxObserver.disconnect();
        }
    }

    /**
     * Returns the canvas size in true display pixels
     *
     * @param {{ width: number, height: number }} [logicalSize]
     */
    getPhysicalCanvasSize(logicalSize) {
        // devicePixelContentBox gives the actual backing-store pixel size.
        // Prefer it whenever available to avoid fractional DPR drift.
        // https://web.dev/articles/device-pixel-content-box
        if (this._devicePixelContentBoxSize) {
            return this._devicePixelContentBoxSize;
        }

        const dpr = window.devicePixelRatio ?? 1;
        logicalSize = logicalSize || this.getLogicalCanvasSize();
        return {
            width: Math.round(logicalSize.width * dpr),
            height: Math.round(logicalSize.height * dpr),
        };
    }

    /**
     * Returns the ratio between true display pixels and logical pixels.
     *
     * @param {{ width: number, height: number }} [logicalSize]
     */
    getDevicePixelRatio(logicalSize) {
        logicalSize = logicalSize || this.getLogicalCanvasSize();
        const physicalSize = this.getPhysicalCanvasSize(logicalSize);
        const widthRatio =
            logicalSize.width > 0
                ? physicalSize.width / logicalSize.width
                : undefined;
        const heightRatio =
            logicalSize.height > 0
                ? physicalSize.height / logicalSize.height
                : undefined;

        if (widthRatio !== undefined && heightRatio !== undefined) {
            // Width and height can differ slightly because backing-store dimensions
            // are integers. Averaging keeps snapping stable in both directions.
            return (widthRatio + heightRatio) / 2;
        } else if (widthRatio !== undefined) {
            // During transient layout states one logical dimension may be zero.
            // Use the non-zero dimension instead of falling back to window DPR.
            return widthRatio;
        } else if (heightRatio !== undefined) {
            return heightRatio;
        } else {
            return window.devicePixelRatio ?? 1;
        }
    }

    /**
     * Returns the size of the canvas canvas container size in logical pixels,
     * without devicePixelRatio correction.
     */
    getLogicalCanvasSize() {
        if (this._logicalCanvasSize) {
            return this._logicalCanvasSize;
        }

        // TODO: The size should never be smaller than the minimum content size!
        const contentSize = this._sizeSource();

        const cs = window.getComputedStyle(this._container, null);
        // clientWidth/clientHeight are integer CSS pixels, which causes subtle
        // blur at fractional DPR. getBoundingClientRect preserves fractions.
        const containerRect = this._container.getBoundingClientRect();

        const paddingLeft = parseFloat(cs.paddingLeft);
        const paddingRight = parseFloat(cs.paddingRight);
        const paddingTop = parseFloat(cs.paddingTop);
        const paddingBottom = parseFloat(cs.paddingBottom);

        const borderLeft = parseFloat(cs.borderLeftWidth);
        const borderRight = parseFloat(cs.borderRightWidth);
        const borderTop = parseFloat(cs.borderTopWidth);
        const borderBottom = parseFloat(cs.borderBottomWidth);

        const width =
            contentSize.width ??
            containerRect.width -
                paddingLeft -
                paddingRight -
                borderLeft -
                borderRight;

        const height =
            contentSize.height ??
            containerRect.height -
                paddingTop -
                paddingBottom -
                borderTop -
                borderBottom;

        this._logicalCanvasSize = { width, height };
        return this._logicalCanvasSize;
    }

    _observeDevicePixelContentBox() {
        if (typeof ResizeObserver != "function") {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const entry = entries.find(
                (candidate) => candidate.target == this._canvas
            );
            if (!entry) {
                return;
            }

            const boxSize = entry.devicePixelContentBoxSize;
            if (!boxSize) {
                return;
            }

            const contentBoxSize = Array.isArray(boxSize)
                ? boxSize[0]
                : boxSize;
            if (!contentBoxSize) {
                return;
            }

            // ResizeObserver reports device pixels directly, which is exactly what
            // canvas width/height expect.
            const nextPhysicalSize = {
                width: contentBoxSize.inlineSize,
                height: contentBoxSize.blockSize,
            };

            if (
                this._devicePixelContentBoxSize &&
                this._devicePixelContentBoxSize.width ==
                    nextPhysicalSize.width &&
                this._devicePixelContentBoxSize.height ==
                    nextPhysicalSize.height
            ) {
                return;
            }

            this._devicePixelContentBoxSize = nextPhysicalSize;
            this._onPhysicalSizeChange();
        });

        try {
            // Fails in browsers that do not support device-pixel-content-box.
            observer.observe(this._canvas, {
                box: "device-pixel-content-box",
            });
            this._devicePixelContentBoxObserver = observer;
        } catch {
            observer.disconnect();
        }
    }
}
