import {
    addExtensionsToContext,
    createFramebufferInfo,
    createTexture,
    getContext,
    isWebGL2,
    resizeFramebufferInfo,
    setTextureFromArray,
} from "twgl.js";
import { isArray, isString } from "vega-util";

import {
    isContinuous,
    isDiscrete,
    isDiscretizing,
    isInterpolating,
} from "vega-scale";
import {
    createDiscreteColorTexture,
    createDiscreteTexture,
    createInterpolatedColorTexture,
    createSchemeTexture,
} from "./colorUtils.js";
import {
    getDiscreteRangeMapper,
    isColorChannel,
    isDiscreteChannel,
} from "../encoder/encoder.js";
import { color } from "d3-color";
import { isMultiPointSelection } from "../selection/selection.js";

export default class WebGLHelper {
    /**
     *
     * @param {HTMLElement} container
     * @param {() => {width: number, height: number}} [sizeSource]
     *      A function that returns the content size. If a dimension is undefined,
     *      the canvas fills the container, otherwise the canvas is adjusted to the content size.
     * @param {string} [clearColor]
     * @param {WebGLContextAttributes} [webglContextAttributes]
     */
    constructor(
        container,
        sizeSource,
        clearColor,
        webglContextAttributes = {}
    ) {
        this._container = container;
        this._sizeSource =
            sizeSource ??
            (() => ({
                width: undefined,
                height: undefined,
            }));

        /** @type {Map<string, WebGLShader>} */
        this._shaderCache = new Map();

        /** @type {WeakMap<import("../view/scaleResolution.js").default, WebGLTexture>} */
        this.rangeTextures = new WeakMap();

        /**
         * @type {WeakMap<import("../types/selectionTypes.js").MultiPointSelection, WebGLTexture>}
         */
        this.selectionTextures = new WeakMap();

        // --------------------------------------------------------

        const canvas = document.createElement("canvas");

        container.appendChild(canvas);

        // TODO: Consider using high-performance powerPreference:
        // https://www.khronos.org/webgl/public-mailing-list/public_webgl/1912/msg00001.php

        const gl = /** @type {WebGL2RenderingContext} */ (
            getContext(canvas, {
                antialias: true,
                // Disable depth writes. We don't use depth testing.
                depth: false,
                premultipliedAlpha: true,
                ...webglContextAttributes,
            })
        );

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

        // TODO: view background: https://vega.github.io/vega-lite/docs/spec.html#view-background

        // Always use pre-multiplied alpha
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this.canvas = canvas;
        this.gl = gl;

        // Setup framebuffer for piccking
        /** @type {import("twgl.js").AttachmentOptions[]} */
        this._pickingAttachmentOptions = [
            {
                format: gl.RGBA,
                type: gl.UNSIGNED_BYTE,
                minMag: gl.LINEAR,
                wrap: gl.CLAMP_TO_EDGE,
            },
        ];
        this._pickingBufferInfo = createFramebufferInfo(
            gl,
            this._pickingAttachmentOptions
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.adjustGl();

        this._updateDpr();

        /** @type {[number, number, number, number]} */
        this._clearColor = [0, 0, 0, 0];
        if (clearColor) {
            const c = color(clearColor).rgb();
            this._clearColor = [c.r / 255, c.g / 255, c.b / 255, c.opacity];
        }
    }

    invalidateSize() {
        this._logicalCanvasSize = undefined;
        this._updateDpr();
        this.adjustGl();
    }

    _updateDpr() {
        this.dpr = window.devicePixelRatio;
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
            height: logicalSize.height * this.dpr,
        };
    }

    /**
     * Returns the canvas size in logical pixels (without devicePixelRatio correction)
     */
    getLogicalCanvasSize() {
        if (this._logicalCanvasSize) {
            return this._logicalCanvasSize;
        }

        // TODO: The size should never be smaller than the minimum content size!
        const contentSize = this._sizeSource();

        const cs = window.getComputedStyle(this._container, null);
        const width =
            contentSize.width ??
            this._container.clientWidth -
                parseFloat(cs.paddingLeft) -
                parseFloat(cs.paddingRight);

        const height =
            contentSize.height ??
            this._container.clientHeight -
                parseFloat(cs.paddingTop) -
                parseFloat(cs.paddingBottom);

        this._logicalCanvasSize = { width, height };
        return this._logicalCanvasSize;
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
        gl.clearColor(...this._clearColor);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    /**
     * Creates textures for color schemes and discrete/discretizing ranges.
     * N.B. Discrete range textures need domain. Thus, this cannot be called
     * before the final domains are resolved.
     *
     * TODO: This may be too specific to be included in WebGLHelper. Find a better place.
     *
     * @param {import("../view/scaleResolution.js").default} resolution
     * @param {boolean} update Update the texture if it exists already.
     */
    createRangeTexture(resolution, update = false) {
        const existingTexture = this.rangeTextures.get(resolution);
        if (!update && existingTexture) {
            return;
        }

        /**
         * TODO: The count configuration logic etc should be combined
         * with scale.js that configures d3 scales using vega specs
         * @param {number} count
         * @param {any} scale
         * @returns {number}
         */
        function fixCount(count, scale) {
            if (isDiscrete(scale.type)) {
                return scale.domain().length;
            } else if (scale.type == "threshold") {
                return scale.domain().length + 1;
            } else if (scale.type == "quantize") {
                return count ?? 4;
            } else if (scale.type == "quantile") {
                return count ?? 4;
            }
            return count;
        }

        const channel = resolution.channel;

        if (isColorChannel(channel)) {
            const scale = resolution.scale;
            const props = scale.props;

            const range = /** @type {any[]} */ (scale.range());

            /** @type {WebGLTexture} */
            let texture;

            if (props.scheme) {
                if (scale.type == "threshold" && range) {
                    // Scale initialization may have configured the range. Let's use it.
                    texture = createDiscreteColorTexture(
                        range,
                        this.gl,
                        scale.domain().length,
                        existingTexture
                    );
                } else {
                    let count = isString(props.scheme)
                        ? undefined
                        : props.scheme.count;

                    count = fixCount(count, scale);

                    texture = createSchemeTexture(
                        props.scheme,
                        this.gl,
                        count,
                        existingTexture
                    );
                }
            } else if (
                // Interpolating
                isInterpolating(scale.type) ||
                // Or piecewise
                (isContinuous(scale.type) && range.length > 1)
            ) {
                texture = createInterpolatedColorTexture(
                    range,
                    props.interpolate,
                    this.gl,
                    existingTexture
                );
            } else {
                texture = createDiscreteColorTexture(
                    range,
                    this.gl,
                    scale.domain().length,
                    existingTexture
                );
            }

            this.rangeTextures.set(resolution, texture);
        } else {
            const scale = resolution.scale;

            if (scale.type === "ordinal" || isDiscretizing(scale.type)) {
                /** @type {function(any):number} Handle "shape" etc */
                const mapper = isDiscreteChannel(channel)
                    ? getDiscreteRangeMapper(channel)
                    : (x) => x;

                const range = /** @type {any[]} */ (scale.range());

                this.rangeTextures.set(
                    resolution,
                    createDiscreteTexture(
                        range.map(mapper),
                        this.gl,
                        scale.domain().length,
                        existingTexture
                    )
                );
            }
        }
    }

    /**
     * @param {import("../types/selectionTypes.js").MultiPointSelection} selection
     */
    createSelectionTexture(selection, update = true) {
        if (!isMultiPointSelection(selection)) {
            throw new Error(
                "Not a multi-point selection, cannot create texture"
            );
        }

        const keys = Array.from(selection.data.keys());
        // Zero is a special value for no selection. The minimum texture size is 1.
        const uniqueIds = keys.length > 0 ? keys.sort((a, b) => a - b) : [0];

        const existingTexture = this.selectionTextures.get(selection);

        const gl = this.gl;
        const texture = createOrUpdateTexture(
            this.gl,
            {
                level: 0,
                minMag: gl.NEAREST,
                format: gl.RED_INTEGER,
                internalFormat: gl.R32UI,
                height: 1,
                width: uniqueIds.length,
            },
            new Uint32Array(uniqueIds),
            update ? existingTexture : false
        );

        this.selectionTextures.set(selection, texture);
    }
}

/**
 * Copy-pasted from twgl.js:
 * https://github.com/greggman/twgl.js/blob/master/src/programs.js
 * Copyright 2019 Gregg Tavares, MIT license
 *
 * @param {string} src
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
    const program = gl.createProgram();
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
        getProgramErrors,
    };
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {Omit<import("twgl.js").TextureOptions, "src">} options
 * @param {number[] | ArrayBufferView} src
 * @param {WebGLTexture} [texture]
 */
export function createOrUpdateTexture(gl, options, src, texture) {
    if (texture) {
        setTextureFromArray(gl, texture, src, options);
    } else {
        texture = createTexture(gl, {
            ...options,
            src,
        });
    }
    return texture;
}
