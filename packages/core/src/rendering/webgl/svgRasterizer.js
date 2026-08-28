import { createFramebufferInfo } from "twgl.js";

import { framebufferToDataUrl } from "./gl/framebufferReadback.js";
import { createLayoutResult } from "../../view/layout/layoutResult.js";
import BufferedViewRenderingContext from "./bufferedViewRenderingContext.js";
import Rectangle from "../../view/layout/rectangle.js";
import { getPhysicalCrop, setRasterImage } from "../svg/raster/rasterImage.js";

/**
 * Renders each contiguous raster run into the same reusable transparent
 * framebuffer and assigns the cropped PNG to its SVG image placeholder.
 *
 * @param {object} options
 * @param {import("../svg/svgViewRenderingContext.js").SvgRasterRun[]} options.runs
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {import("../../view/layout/layoutResult.js").default} [options.layoutResult]
 * @param {import("./gl/webGLHelper.js").default} options.webGLHelper
 * @param {import("./rendererResources.js").default} options.markAdapter
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {number} options.pixelRatio
 */
export function rasterizeSvgRuns({
    runs,
    viewRoot,
    layoutResult,
    webGLHelper,
    markAdapter,
    logicalWidth,
    logicalHeight,
    pixelRatio,
}) {
    const gl = webGLHelper.gl;
    const width = Math.ceil(logicalWidth * pixelRatio);
    const height = Math.ceil(logicalHeight * pixelRatio);
    validateFramebufferSize(gl, width, height);
    const rasterLayoutResult =
        pixelRatio == 1 && layoutResult
            ? layoutResult
            : createLayoutResult(
                  viewRoot,
                  Rectangle.create(0, 0, logicalWidth, logicalHeight),
                  {
                      devicePixelRatio: pixelRatio,
                      renderingOptions: { firstFacet: true },
                  }
              );

    const framebufferInfo = createFramebufferInfo(
        gl,
        [
            {
                format: gl.RGBA,
                type: gl.UNSIGNED_BYTE,
                minMag: gl.LINEAR,
                wrap: gl.CLAMP_TO_EDGE,
            },
        ],
        width,
        height
    );

    try {
        for (const run of runs) {
            const renderingContext = new BufferedViewRenderingContext(
                { picking: false },
                {
                    webGLHelper,
                    markAdapter,
                    canvasSize: {
                        width: logicalWidth,
                        height: logicalHeight,
                    },
                    devicePixelRatio: pixelRatio,
                    framebufferInfo,
                    markPredicate: (mark) => run.marks.has(mark),
                    pixelOffset: 0,
                }
            );
            rasterLayoutResult.collectRenderCommands(renderingContext);
            renderingContext.finish();
            renderingContext.render();

            const crop = getPhysicalCrop(run.bounds, pixelRatio, width, height);
            const href = framebufferToDataUrl(
                gl,
                framebufferInfo,
                "image/png",
                { ...crop, unpremultiplyAlpha: true }
            );
            setRasterImage(run, crop, pixelRatio, href);
        }
    } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(
            /** @type {WebGLTexture} */ (framebufferInfo.attachments[0])
        );
        gl.deleteFramebuffer(framebufferInfo.framebuffer);
    }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} width
 * @param {number} height
 */
function validateFramebufferSize(gl, width, height) {
    const maxRenderbufferSize = /** @type {number} */ (
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
    );
    const maxTextureSize = /** @type {number} */ (
        gl.getParameter(gl.MAX_TEXTURE_SIZE)
    );
    const maxSize = Math.min(maxRenderbufferSize, maxTextureSize);
    if (width <= 0 || height <= 0 || width > maxSize || height > maxSize) {
        throw new RangeError(
            `SVG raster dimensions ${width} x ${height} exceed the WebGL limit ${maxSize}.`
        );
    }
}
