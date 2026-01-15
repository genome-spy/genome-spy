import { createFramebufferInfo } from "twgl.js";

import BufferedViewRenderingContext from "../view/renderingContext/bufferedViewRenderingContext.js";
import Rectangle from "../view/layout/rectangle.js";
import { framebufferToDataUrl } from "../gl/webGLHelper.js";

/**
 * @param {object} options
 * @param {import("../gl/webGLHelper.js").default} options.glHelper
 * @param {import("../view/view.js").default} options.viewRoot
 * @param {number} [options.logicalWidth]
 * @param {number} [options.logicalHeight]
 * @param {number} [options.devicePixelRatio]
 * @param {string} [options.clearColor]
 * @returns {string}
 */
export function exportCanvas({
    glHelper,
    viewRoot,
    logicalWidth,
    logicalHeight,
    devicePixelRatio,
    clearColor = "white",
}) {
    logicalWidth ??= glHelper.getLogicalCanvasSize().width;
    logicalHeight ??= glHelper.getLogicalCanvasSize().height;
    devicePixelRatio ??= window.devicePixelRatio ?? 1;

    const gl = glHelper.gl;

    const width = Math.floor(logicalWidth * devicePixelRatio);
    const height = Math.floor(logicalHeight * devicePixelRatio);

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

    const renderingContext = new BufferedViewRenderingContext(
        { picking: false },
        {
            webGLHelper: glHelper,
            canvasSize: { width: logicalWidth, height: logicalHeight },
            devicePixelRatio,
            clearColor,
            framebufferInfo,
        }
    );

    viewRoot.render(
        renderingContext,
        Rectangle.create(0, 0, logicalWidth, logicalHeight)
    );
    renderingContext.render();

    return framebufferToDataUrl(gl, framebufferInfo, "image/png");
}
