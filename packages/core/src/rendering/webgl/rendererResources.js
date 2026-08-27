import { createTexture } from "twgl.js";

import WebGLArrowMark from "./marks/arrow.js";
import WebGLLinkMark from "./marks/link.js";
import WebGLPointMark from "./marks/point.js";
import WebGLRectMark from "./marks/rect.js";
import WebGLRuleMark from "./marks/rule.js";
import WebGLTextMark from "./marks/text.js";

const markTypes = {
    point: WebGLPointMark,
    rect: WebGLRectMark,
    arrow: WebGLArrowMark,
    rule: WebGLRuleMark,
    tick: WebGLRuleMark,
    link: WebGLLinkMark,
    text: WebGLTextMark,
};

export default class WebGLRendererResources {
    #disposed = false;

    /** @type {Set<WebGLTexture>} */
    #fontTextures = new Set();

    /** @param {import("./gl/webGLHelper.js").default} glHelper */
    constructor(glHelper) {
        this.glHelper = glHelper;
    }

    /** @param {import("../../marks/mark.js").default} mark */
    createMark(mark) {
        this.#assertActive();
        const Mark = markTypes[mark.getType()];
        if (!Mark) {
            throw new Error("Unsupported WebGL mark type: " + mark.getType());
        }
        return new Mark(mark, this.glHelper);
    }

    /** @param {import("../../scales/scaleResolution.js").default} resolution */
    updateScaleResolution(resolution) {
        this.#assertActive();
        this.glHelper.createRangeTexture(resolution, true);
    }

    /**
     * Starts loading a bitmap into a WebGL texture. The texture object is
     * returned immediately because mark initialization and bitmap decoding are
     * intentionally allowed to proceed in parallel.
     *
     * @param {string} bitmapUrl
     * @returns {import("../../types/viewContext.js").RendererResourceLoad}
     */
    loadFontResource(bitmapUrl) {
        this.#assertActive();

        const gl = this.glHelper.gl;
        /** @type {WebGLTexture} */
        let texture;
        const ready = new Promise((resolve, reject) => {
            texture = createTexture(
                gl,
                { src: bitmapUrl, min: gl.LINEAR },
                (error) => {
                    if (error) {
                        this.#fontTextures.delete(texture);
                        gl.deleteTexture(texture);
                        reject(error);
                    } else if (this.#disposed) {
                        reject(
                            new Error(
                                "WebGL renderer resources were disposed while loading a font."
                            )
                        );
                    } else {
                        resolve();
                    }
                }
            );
        });
        this.#fontTextures.add(texture);

        return { resource: texture, ready };
    }

    dispose() {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        const gl = this.glHelper.gl;
        for (const texture of this.#fontTextures) {
            gl.deleteTexture(texture);
        }
        this.#fontTextures.clear();
    }

    #assertActive() {
        if (this.#disposed) {
            throw new Error("WebGL renderer resources have been disposed.");
        }
    }
}
