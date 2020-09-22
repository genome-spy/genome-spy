import * as twgl from "twgl.js";
import { getPlatformShaderDefines } from "./includes/fp64-utils";

export default class WebGLHelper {
    /**
     *
     * @param {HTMLElement} container
     */
    constructor(container) {
        this._container = container;

        /** @type {{ type: string, listener: function}[]} */
        this._listeners = [];

        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";

        container.appendChild(canvas);

        const gl = twgl.getContext(canvas);
        twgl.addExtensionsToContext(gl);

        if (!gl) {
            throw new Error(
                "Unable to initialize WebGL. Your browser or machine may not support it."
            );
        }

        // TODO: Configurable
        gl.clearColor(1, 1, 1, 1);
        // TODO: view background: https://vega.github.io/vega-lite/docs/spec.html#view-background

        // Always use pre-multiplied alpha
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this._shaderDefines = getPlatformShaderDefines(gl);

        this.canvas = canvas;
        this.gl = gl;

        this.adjustGl();

        const resizeObserver = new ResizeObserver(entries => {
            this.adjustGl();
            this._emit("repaint");
        });
        resizeObserver.observe(this._container);

        // TODO: Observe devicePixelRatio
        // https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#Monitoring_screen_resolution_or_zoom_level_changes
    }

    /**
     * @param {string} shaderCode
     * @param {string[]} [extraHeaders]
     */
    processShader(shaderCode, extraHeaders) {
        return [
            ...(extraHeaders || []),
            this._shaderDefines || "",
            shaderCode
        ].join("\n\n");
    }

    adjustGl() {
        const logicalSize = this.getLogicalCanvasSize();
        this.canvas.style.width = `${logicalSize.width}px`;
        this.canvas.style.height = `${logicalSize.height}px`;

        const physicalSize = this.getPhysicalCanvasSize(logicalSize);
        this.canvas.width = physicalSize.width;
        this.canvas.height = physicalSize.height;
    }

    destroy() {
        this.canvas.remove();
    }

    /**
     * Returns the canvas size in true display pixels
     *
     * @param {{ width: number, height: number }} [logicalSize]
     */
    getPhysicalCanvasSize(logicalSize) {
        logicalSize = logicalSize || this.getLogicalCanvasSize();
        return {
            width: logicalSize.width * window.devicePixelRatio,
            height: logicalSize.height * window.devicePixelRatio
        };
    }

    /**
     * Returns the canvas size in logical pixels (without devicePixelRatio correction)
     */
    getLogicalCanvasSize() {
        // TODO: Size should never be smaller than the minimum content size!

        const cs = window.getComputedStyle(this._container, null);
        const width =
            this._container.clientWidth -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight);

        const height =
            this._container.clientHeight -
            parseFloat(cs.paddingTop) -
            parseFloat(cs.paddingBottom);

        return { width, height };
    }

    /**
     * @param {"repaint"} eventType
     * @param {function} listener
     */
    addEventListener(eventType, listener) {
        this._listeners.push({ type: eventType, listener });
    }

    /**
     * @param {string} eventType
     */
    _emit(eventType) {
        for (const entry of this._listeners) {
            if (entry.type === eventType) {
                entry.listener();
            }
        }
    }
}
