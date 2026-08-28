import { createFramebufferInfo } from "twgl.js";

import BufferedViewRenderingContext from "./bufferedViewRenderingContext.js";
import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import {
    framebufferToBlob,
    framebufferToDataUrl,
} from "./gl/framebufferReadback.js";

/**
 * @param {object} options
 * @param {import("./gl/webGLHelper.js").default} options.glHelper
 * @param {import("./rendererResources.js").default} options.markAdapter
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {number} [options.logicalWidth]
 * @param {number} [options.logicalHeight]
 * @param {number} [options.devicePixelRatio]
 * @param {string | null} [options.clearColor]
 * @returns {string}
 * @deprecated Use exportRaster instead.
 */
export function exportCanvas({
    glHelper,
    markAdapter,
    viewRoot,
    logicalWidth,
    logicalHeight,
    devicePixelRatio,
    clearColor = "white",
}) {
    const { gl, framebufferInfo } = renderToFramebuffer({
        glHelper,
        markAdapter,
        viewRoot,
        logicalWidth,
        logicalHeight,
        pixelRatio: devicePixelRatio,
        clearColor,
    });

    try {
        return framebufferToDataUrl(gl, framebufferInfo, "image/png");
    } finally {
        deleteFramebuffer(gl, framebufferInfo);
    }
}

/**
 * @param {object} options
 * @param {import("./gl/webGLHelper.js").default} options.glHelper
 * @param {import("./rendererResources.js").default} options.markAdapter
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {number} [options.logicalWidth]
 * @param {number} [options.logicalHeight]
 * @param {number} [options.pixelRatio]
 * @param {string | null} [options.clearColor]
 * @param {"image/png"} [options.mimeType]
 * @returns {Promise<Blob>}
 */
export async function exportRaster({
    glHelper,
    markAdapter,
    viewRoot,
    logicalWidth,
    logicalHeight,
    pixelRatio,
    clearColor = "white",
    mimeType = "image/png",
}) {
    if (mimeType != "image/png") {
        throw new Error(`Unsupported raster export MIME type: ${mimeType}`);
    }

    const { gl, framebufferInfo } = renderToFramebuffer({
        glHelper,
        markAdapter,
        viewRoot,
        logicalWidth,
        logicalHeight,
        pixelRatio,
        clearColor,
    });

    try {
        return await framebufferToBlob(gl, framebufferInfo, mimeType);
    } finally {
        deleteFramebuffer(gl, framebufferInfo);
    }
}

/**
 * @param {object} options
 * @param {import("./gl/webGLHelper.js").default} options.glHelper
 * @param {import("./rendererResources.js").default} options.markAdapter
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {number} [options.logicalWidth]
 * @param {number} [options.logicalHeight]
 * @param {number} [options.pixelRatio]
 * @param {string | null} options.clearColor
 */
function renderToFramebuffer({
    glHelper,
    markAdapter,
    viewRoot,
    logicalWidth,
    logicalHeight,
    pixelRatio,
    clearColor,
}) {
    logicalWidth ??= glHelper.getLogicalCanvasSize().width;
    logicalHeight ??= glHelper.getLogicalCanvasSize().height;
    pixelRatio ??= window.devicePixelRatio ?? 1;

    const gl = glHelper.gl;

    const width = Math.floor(logicalWidth * pixelRatio);
    const height = Math.floor(logicalHeight * pixelRatio);

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

    /** @type {import("twgl.js").FramebufferInfo | undefined} */
    let multisampleFramebufferInfo;
    try {
        multisampleFramebufferInfo = createFramebufferInfo(
            gl,
            [
                {
                    format: gl.RGBA8,
                    samples: Math.min(
                        4,
                        /** @type {number} */ (gl.getParameter(gl.MAX_SAMPLES))
                    ),
                },
            ],
            width,
            height
        );

        const renderingContext = new BufferedViewRenderingContext(
            { picking: false },
            {
                webGLHelper: glHelper,
                markAdapter,
                canvasSize: { width: logicalWidth, height: logicalHeight },
                devicePixelRatio: pixelRatio,
                clearColor,
                framebufferInfo: multisampleFramebufferInfo,
            }
        );

        const layoutResult = createLayoutResult(
            viewRoot,
            Rectangle.create(0, 0, logicalWidth, logicalHeight),
            { devicePixelRatio: pixelRatio }
        );
        layoutResult.collectRenderCommands(renderingContext);
        renderingContext.finish();
        renderingContext.render();

        gl.bindFramebuffer(
            gl.READ_FRAMEBUFFER,
            multisampleFramebufferInfo.framebuffer
        );
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebufferInfo.framebuffer);
        gl.blitFramebuffer(
            0,
            0,
            width,
            height,
            0,
            0,
            width,
            height,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST
        );

        return { gl, framebufferInfo };
    } catch (error) {
        deleteFramebuffer(gl, framebufferInfo);
        throw error;
    } finally {
        if (multisampleFramebufferInfo) {
            gl.deleteRenderbuffer(
                /** @type {WebGLRenderbuffer} */ (
                    multisampleFramebufferInfo.attachments[0]
                )
            );
            gl.deleteFramebuffer(multisampleFramebufferInfo.framebuffer);
        }
    }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {import("twgl.js").FramebufferInfo} framebufferInfo
 */
function deleteFramebuffer(gl, framebufferInfo) {
    gl.deleteTexture(
        /** @type {WebGLTexture} */ (framebufferInfo.attachments[0])
    );
    gl.deleteFramebuffer(framebufferInfo.framebuffer);
}
