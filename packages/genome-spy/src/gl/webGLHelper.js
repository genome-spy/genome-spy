import {
    addExtensionsToContext,
    createFramebufferInfo,
    getContext,
    isWebGL2,
    resizeFramebufferInfo
} from "twgl.js";
import { isArray } from "vega-util";
import { getPlatformShaderDefines } from "./includes/fp64-utils";

export default class WebGLHelper {
    /**
     *
     * @param {HTMLElement} container
     */
    constructor(container) {
        this._container = container;

        /** @type {Map<string, WebGLShader>} */
        this._shaderCache = new Map();

        /** @type {{ type: string, listener: function}[]} */
        this._listeners = [];

        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";

        container.appendChild(canvas);

        /** @type {WebGL2RenderingContext} */
        const gl = getContext(canvas);

        if (!gl) {
            throw new Error(
                "Unable to initialize WebGL. Your browser or machine may not support it."
            );
        }

        if (!isWebGL2(gl)) {
            throw new Error(
                "Your web browser does not support WebGL 2.0. Chrome, Firefox, and Safari Tech Preview should work."
            );
        }

        addExtensionsToContext(gl);

        // Disable depth writes. We don't use depth testing.
        gl.depthMask(false);

        // TODO: view background: https://vega.github.io/vega-lite/docs/spec.html#view-background

        // Always use pre-multiplied alpha
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this._shaderDefines = getPlatformShaderDefines(gl);

        this.canvas = canvas;
        this.gl = gl;

        // Setup framebuffer for piccking
        /** @type {import("twgl.js").AttachmentOptions[]} */
        this._pickingAttachmentOptions = [
            {
                format: gl.RGBA,
                type: gl.UNSIGNED_BYTE,
                minMag: gl.LINEAR,
                wrap: gl.CLAMP_TO_EDGE
            }
        ];
        this._pickingBufferInfo = createFramebufferInfo(
            gl,
            this._pickingAttachmentOptions
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.adjustGl();

        this._resizeObserver = new ResizeObserver(entries => {
            this._logicalCanvasSize = undefined;
            this._updateDpr();
            this.adjustGl();
            this.render();
        });
        this._resizeObserver.observe(this._container);

        // TODO: Observe devicePixelRatio
        // https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#Monitoring_screen_resolution_or_zoom_level_changes

        this._updateDpr();
    }

    _updateDpr() {
        this.dpr = window.devicePixelRatio;
    }

    render() {
        this._emit("resize");
        this._emit("render");
    }

    /**
     * Compiles and caches a shader. The shader source is used as a cache key.
     *
     * @param {number} type gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
     * @param {string | string[]} glsl
     */
    compileShader(type, glsl) {
        const VERSION = "#version 300 es";
        const PRECISION = "precision mediump float;";

        if (isArray(glsl)) {
            glsl = glsl.join("\n\n");
        }

        const gl = this.gl;
        const cacheKey = glsl.replaceAll(/ {2,}|^\s*\/\/.*$/gm, "");

        let shader = this._shaderCache.get(cacheKey);
        if (!shader) {
            const stitchedSource = [VERSION, PRECISION, glsl].join("\n\n");

            shader = gl.createShader(type);
            gl.shaderSource(shader, stitchedSource);
            gl.compileShader(shader);

            // Don't check errors here. Only check them if linking fails.

            this._shaderCache.set(cacheKey, shader);
        }

        return shader;
    }

    adjustGl() {
        const logicalSize = this.getLogicalCanvasSize();
        this.canvas.style.width = `${logicalSize.width}px`;
        this.canvas.style.height = `${logicalSize.height}px`;

        const physicalSize = this.getPhysicalCanvasSize(logicalSize);
        this.canvas.width = physicalSize.width;
        this.canvas.height = physicalSize.height;

        resizeFramebufferInfo(
            this.gl,
            this._pickingBufferInfo,
            this._pickingAttachmentOptions
        );
    }

    finalize() {
        this._resizeObserver.unobserve(this._container);
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
            width: logicalSize.width * this.dpr,
            height: logicalSize.height * this.dpr
        };
    }

    /**
     * Returns the canvas size in logical pixels (without devicePixelRatio correction)
     */
    getLogicalCanvasSize() {
        // TODO: Size should never be smaller than the minimum content size!

        if (this._logicalCanvasSize) {
            return this._logicalCanvasSize;
        }

        const cs = window.getComputedStyle(this._container, null);
        const width =
            this._container.clientWidth -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight);

        const height =
            this._container.clientHeight -
            parseFloat(cs.paddingTop) -
            parseFloat(cs.paddingBottom);

        this._logicalCanvasSize = { width, height };
        return this._logicalCanvasSize;
    }

    /**
     * @param {"render"|"resize"} eventType
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

    /**
     *
     * @param {number} x
     * @param {number} y
     */
    readPickingPixel(x, y) {
        const gl = this.gl;

        x *= this.dpr;
        y *= this.dpr;

        const height = this.getPhysicalCanvasSize().height;

        const pixel = new Uint8Array(4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._pickingBufferInfo.framebuffer);
        gl.readPixels(
            x,
            height - y - 1,
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return pixel;
    }

    clearAll() {
        const gl = this.gl;
        const { width, height } = this.getPhysicalCanvasSize();
        gl.viewport(0, 0, width, height);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}

/**
 * Copy-pasted from twgl.js:
 * https://github.com/greggman/twgl.js/blob/master/src/programs.js
 * Copyright 2019 Gregg Tavares, MIT license
 */
function addLineNumbersWithError(src, log = "", lineOffset = 0) {
    const errorRE = /ERROR:\s*\d+:(\d+)/gi;
    // Note: Error message formats are not defined by any spec so this may or may not work.
    const matches = [...log.matchAll(errorRE)];
    const lineNoToErrorMap = new Map(
        matches.map((m, ndx) => {
            const lineNo = parseInt(m[1]);
            const next = matches[ndx + 1];
            const end = next ? next.index : log.length;
            const msg = log.substring(m.index, end);
            return [lineNo - 1, msg];
        })
    );
    return src
        .split("\n")
        .map((line, lineNo) => {
            const err = lineNoToErrorMap.get(lineNo);
            return `${lineNo + 1 + lineOffset}: ${line}${
                err ? `\n\n^^^ ${err}` : ""
            }`;
        })
        .join("\n");
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLShader} vertexShader
 * @param {WebGLShader} fragmentShader
 */
export function createProgram(gl, vertexShader, fragmentShader) {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    function getProgramErrors() {
        /** @type {string} */
        let errorMsg;
        /** @type {string} */
        let errorDetail;

        const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!linked) {
            errorMsg = gl.getProgramInfoLog(program);

            for (const shader of [vertexShader, fragmentShader]) {
                const compiled = gl.getShaderParameter(
                    shader,
                    gl.COMPILE_STATUS
                );
                if (!compiled) {
                    errorMsg = gl.getShaderInfoLog(shader);
                    errorDetail =
                        addLineNumbersWithError(
                            gl.getShaderSource(shader),
                            errorMsg,
                            0
                        ) + `\nError compiling: ${errorMsg}`;
                    gl.deleteShader(shader);
                }
            }
            gl.deleteProgram(program);
        }

        if (errorMsg) {
            return { message: errorMsg, detail: errorDetail };
        }
    }

    return {
        program,
        getProgramErrors
    };
}
