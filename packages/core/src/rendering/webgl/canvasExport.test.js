import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createFramebufferInfo: vi.fn(),
    framebufferToBlob: vi.fn(),
    renderingContexts: /** @type {{options: any}[]} */ ([]),
}));

vi.mock("twgl.js", () => ({
    createFramebufferInfo: mocks.createFramebufferInfo,
}));

vi.mock("./gl/framebufferReadback.js", () => ({
    framebufferToBlob: mocks.framebufferToBlob,
    framebufferToDataUrl: vi.fn(),
}));

vi.mock("./bufferedViewRenderingContext.js", () => ({
    default: class {
        /** @param {object} _globalOptions @param {any} options */
        constructor(_globalOptions, options) {
            this.options = options;
            mocks.renderingContexts.push(this);
        }

        render() {}
    },
}));

import { exportRaster } from "./canvasExport.js";

describe("exportRaster", () => {
    test("rejects raster formats that are not yet supported", async () => {
        await expect(
            exportRaster({
                glHelper: /** @type {any} */ ({}),
                viewRoot: /** @type {any} */ ({}),
                mimeType: /** @type {any} */ ("image/webp"),
            })
        ).rejects.toThrow("Unsupported raster export MIME type: image/webp");
    });

    test("renders with MSAA and resolves into the readback texture", async () => {
        const resolved = { framebuffer: {}, attachments: [{}] };
        const multisampled = { framebuffer: {}, attachments: [{}] };
        mocks.createFramebufferInfo
            .mockReturnValueOnce(resolved)
            .mockReturnValueOnce(multisampled);

        const gl = createGl();
        const viewRoot = { arrange: vi.fn() };
        await exportRaster({
            glHelper: /** @type {any} */ ({ gl }),
            viewRoot: /** @type {any} */ (viewRoot),
            logicalWidth: 200,
            logicalHeight: 100,
            pixelRatio: 1.5,
        });

        expect(mocks.createFramebufferInfo).toHaveBeenNthCalledWith(
            2,
            gl,
            [{ format: gl.RGBA8, samples: 4 }],
            300,
            150
        );
        expect(mocks.renderingContexts.at(-1).options.framebufferInfo).toBe(
            multisampled
        );
        expect(gl.blitFramebuffer).toHaveBeenCalledWith(
            0,
            0,
            300,
            150,
            0,
            0,
            300,
            150,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST
        );
    });
});

function createGl() {
    return /** @type {any} */ ({
        RGBA8: "RGBA8",
        MAX_SAMPLES: "MAX_SAMPLES",
        READ_FRAMEBUFFER: "READ_FRAMEBUFFER",
        DRAW_FRAMEBUFFER: "DRAW_FRAMEBUFFER",
        COLOR_BUFFER_BIT: "COLOR_BUFFER_BIT",
        NEAREST: "NEAREST",
        getParameter: vi.fn().mockReturnValue(8),
        bindFramebuffer: vi.fn(),
        blitFramebuffer: vi.fn(),
        deleteRenderbuffer: vi.fn(),
        deleteTexture: vi.fn(),
        deleteFramebuffer: vi.fn(),
    });
}
