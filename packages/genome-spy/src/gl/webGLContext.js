import * as twgl from "twgl.js";
import { getPlatformShaderDefines, fp64ify } from "../gl/includes/fp64-utils";

export default class WebGLContext {
    /**
     *
     * @param {HTMLElement} containerElement
     */
    constructor(containerElement) {
        this._containerElement = containerElement;

        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        canvas.style.left = "0";
        canvas.style.right = "0";
        canvas.style.top = "0";
        canvas.style.bottom = "0";
        // TODO: take padding into account

        containerElement.appendChild(canvas);

        const gl = twgl.getContext(canvas);
        twgl.addExtensionsToContext(gl);

        if (!gl) {
            throw new Error(
                "Unable to initialize WebGL. Your browser or machine may not support it."
            );
        }

        // TODO: Configurable
        gl.clearColor(1, 1, 1, 1);

        // Always use pre-multiplied alpha
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this._shaderDefines = getPlatformShaderDefines(gl);

        this.canvas = canvas;
        this.gl = gl;
    }

    /**
     * @param {string} shaderCode
     */
    processShader(shaderCode) {
        return this._shaderDefines + "\n" + shaderCode;
    }

    adjustGl() {
        this.gl.canvas.width =
            this.canvas.clientWidth * window.devicePixelRatio;
        this.gl.canvas.height =
            this.canvas.clientHeight * window.devicePixelRatio;

        this.gl.viewport(
            0,
            0,
            this.gl.drawingBufferWidth,
            this.gl.drawingBufferHeight
        );
    }

    destroy() {
        this.canvas.remove();
    }
}
