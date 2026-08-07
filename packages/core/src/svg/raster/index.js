import { createFramebufferInfo } from "twgl.js";

import { framebufferToDataUrl } from "../../gl/framebufferReadback.js";
import { WEBGL_COORDINATE_OFFSET } from "../../gl/renderingConstants.js";
import BufferedViewRenderingContext from "../../view/renderingContext/bufferedViewRenderingContext.js";
import Rectangle from "../../view/layout/rectangle.js";
import { formatSvgNumber } from "../svgNumber.js";

/**
 * Renders each contiguous raster run into the same reusable transparent
 * framebuffer and assigns the cropped PNG to its SVG image placeholder.
 *
 * @param {object} options
 * @param {import("../svgViewRenderingContext.js").SvgRasterRun[]} options.runs
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {import("../../gl/webGLHelper.js").default} options.webGLHelper
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {number} options.pixelRatio
 */
export function rasterizeSvgRuns({
    runs,
    viewRoot,
    webGLHelper,
    logicalWidth,
    logicalHeight,
    pixelRatio,
}) {
    const gl = webGLHelper.gl;
    const width = Math.ceil(logicalWidth * pixelRatio);
    const height = Math.ceil(logicalHeight * pixelRatio);
    validateFramebufferSize(gl, width, height);

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
                    canvasSize: {
                        width: logicalWidth,
                        height: logicalHeight,
                    },
                    devicePixelRatio: pixelRatio,
                    framebufferInfo,
                    markPredicate: (mark) => run.marks.has(mark),
                }
            );
            viewRoot.render(
                renderingContext,
                Rectangle.create(0, 0, logicalWidth, logicalHeight),
                { firstFacet: true }
            );
            renderingContext.render();

            const crop = getPhysicalCrop(run.bounds, pixelRatio, width, height);
            const href = framebufferToDataUrl(
                gl,
                framebufferInfo,
                "image/png",
                { ...crop, unpremultiplyAlpha: true }
            );
            const image = run.image;
            if (!image) {
                throw new Error("Raster run has no SVG image placeholder.");
            }
            // Undo the half-logical-pixel offset applied by WebGL when
            // compositing the pixels with SVG geometry.
            image.setAttribute(
                "x",
                "" +
                    formatSvgNumber(
                        crop.x / pixelRatio - WEBGL_COORDINATE_OFFSET
                    )
            );
            image.setAttribute(
                "y",
                "" +
                    formatSvgNumber(
                        crop.y / pixelRatio - WEBGL_COORDINATE_OFFSET
                    )
            );
            image.setAttribute(
                "width",
                "" + formatSvgNumber(crop.width / pixelRatio)
            );
            image.setAttribute(
                "height",
                "" + formatSvgNumber(crop.height / pixelRatio)
            );
            image.setAttribute("href", href);
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

/**
 * @param {import("../svgBounds.js").SvgBounds} bounds
 * @param {number} pixelRatio
 * @param {number} framebufferWidth
 * @param {number} framebufferHeight
 */
function getPhysicalCrop(
    bounds,
    pixelRatio,
    framebufferWidth,
    framebufferHeight
) {
    const x = Math.max(0, Math.floor(bounds.x1 * pixelRatio));
    const y = Math.max(0, Math.floor(bounds.y1 * pixelRatio));
    const x2 = Math.min(framebufferWidth, Math.ceil(bounds.x2 * pixelRatio));
    const y2 = Math.min(framebufferHeight, Math.ceil(bounds.y2 * pixelRatio));
    return { x, y, width: x2 - x, height: y2 - y };
}
