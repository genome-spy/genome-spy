// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const contexts = /** @type {object[]} */ ([]);
    return {
        createFramebufferInfo: vi.fn(),
        framebufferToDataUrl: vi.fn(),
        contexts,
        RenderingContext: class {
            /** @param {object} _globalOptions @param {object} options */
            constructor(_globalOptions, options) {
                this.options = options;
                contexts.push(this);
            }

            render = vi.fn();
        },
    };
});

vi.mock("twgl.js", () => ({
    createFramebufferInfo: mocks.createFramebufferInfo,
}));

vi.mock("../../gl/framebufferReadback.js", () => ({
    framebufferToDataUrl: mocks.framebufferToDataUrl,
}));

vi.mock("../../view/renderingContext/bufferedViewRenderingContext.js", () => ({
    default: mocks.RenderingContext,
}));

import { rasterizeSvgRuns } from "./index.js";

beforeEach(() => {
    mocks.createFramebufferInfo.mockReset();
    mocks.framebufferToDataUrl.mockReset();
    mocks.contexts.length = 0;
});

describe("rasterizeSvgRuns", () => {
    test("reuses one framebuffer and crops each run at the pixel ratio", () => {
        const fixture = createFixture();
        const runs = [
            createRun({ x1: 1.25, y1: 2.25, x2: 10.1, y2: 12.6 }),
            createRun({ x1: 20, y1: 30, x2: 40, y2: 50 }),
        ];
        mocks.framebufferToDataUrl
            .mockReturnValueOnce("data:image/png;base64,first")
            .mockReturnValueOnce("data:image/png;base64,second");

        rasterizeSvgRuns({
            runs,
            viewRoot: fixture.viewRoot,
            webGLHelper: fixture.webGLHelper,
            logicalWidth: 100,
            logicalHeight: 80,
            pixelRatio: 2,
        });

        expect(mocks.createFramebufferInfo).toHaveBeenCalledOnce();
        expect(mocks.createFramebufferInfo).toHaveBeenCalledWith(
            fixture.gl,
            expect.any(Array),
            200,
            160
        );
        expect(mocks.contexts).toHaveLength(2);
        expect(fixture.viewRoot.render).toHaveBeenCalledTimes(2);
        expect(mocks.framebufferToDataUrl).toHaveBeenNthCalledWith(
            1,
            fixture.gl,
            fixture.framebufferInfo,
            "image/png",
            {
                x: 2,
                y: 4,
                width: 19,
                height: 22,
                unpremultiplyAlpha: true,
            }
        );
        expect(runs[0].image.getAttribute("x")).toBe("0.5");
        expect(runs[0].image.getAttribute("y")).toBe("1.5");
        expect(runs[0].image.getAttribute("width")).toBe("9.5");
        expect(runs[0].image.getAttribute("height")).toBe("11");
        expect(runs[0].image.getAttribute("href")).toBe(
            "data:image/png;base64,first"
        );
        expect(fixture.gl.deleteTexture).toHaveBeenCalledWith(fixture.texture);
        expect(fixture.gl.deleteFramebuffer).toHaveBeenCalledWith(
            fixture.framebuffer
        );
    });

    test("rejects framebuffer dimensions above the GPU limit", () => {
        const fixture = createFixture(128);

        expect(() =>
            rasterizeSvgRuns({
                runs: [createRun({ x1: 0, y1: 0, x2: 100, y2: 80 })],
                viewRoot: fixture.viewRoot,
                webGLHelper: fixture.webGLHelper,
                logicalWidth: 100,
                logicalHeight: 80,
                pixelRatio: 2,
            })
        ).toThrow("200 x 160 exceed the WebGL limit 128");
        expect(mocks.createFramebufferInfo).not.toHaveBeenCalled();
    });

    test("releases framebuffer resources when readback fails", () => {
        const fixture = createFixture();
        mocks.framebufferToDataUrl.mockImplementation(() => {
            throw new Error("readback failed");
        });

        expect(() =>
            rasterizeSvgRuns({
                runs: [createRun({ x1: 0, y1: 0, x2: 10, y2: 10 })],
                viewRoot: fixture.viewRoot,
                webGLHelper: fixture.webGLHelper,
                logicalWidth: 100,
                logicalHeight: 80,
                pixelRatio: 1,
            })
        ).toThrow("readback failed");
        expect(fixture.gl.bindFramebuffer).toHaveBeenLastCalledWith(
            fixture.gl.FRAMEBUFFER,
            null
        );
        expect(fixture.gl.deleteTexture).toHaveBeenCalledWith(fixture.texture);
        expect(fixture.gl.deleteFramebuffer).toHaveBeenCalledWith(
            fixture.framebuffer
        );
    });
});

/** @param {number} [maxSize] */
function createFixture(maxSize = 4096) {
    const framebuffer = /** @type {WebGLFramebuffer} */ ({});
    const texture = /** @type {WebGLTexture} */ ({});
    const framebufferInfo = {
        framebuffer,
        attachments: [texture],
        width: 0,
        height: 0,
    };
    const gl = /** @type {WebGL2RenderingContext} */ (
        /** @type {unknown} */ ({
            RGBA: 0x1908,
            UNSIGNED_BYTE: 0x1401,
            LINEAR: 0x2601,
            CLAMP_TO_EDGE: 0x812f,
            FRAMEBUFFER: 0x8d40,
            MAX_RENDERBUFFER_SIZE: 0x84e8,
            MAX_TEXTURE_SIZE: 0x0d33,
            getParameter: vi.fn(() => maxSize),
            bindFramebuffer: vi.fn(),
            deleteTexture: vi.fn(),
            deleteFramebuffer: vi.fn(),
        })
    );
    mocks.createFramebufferInfo.mockReturnValue(framebufferInfo);
    return {
        gl,
        framebuffer,
        texture,
        framebufferInfo,
        webGLHelper: /** @type {import("../../gl/webGLHelper.js").default} */ (
            /** @type {unknown} */ ({ gl })
        ),
        viewRoot: /** @type {import("../../view/view.js").default} */ (
            /** @type {unknown} */ ({ render: vi.fn() })
        ),
    };
}

/** @param {import("../svgBounds.js").SvgBounds} bounds */
function createRun(bounds) {
    return /** @type {import("../svgViewRenderingContext.js").SvgRasterRun} */ ({
        marks: new Set(),
        targets: [],
        viewNodes: new Set(),
        anchor: document.createComment("raster-run"),
        bounds,
        image: document.createElementNS("http://www.w3.org/2000/svg", "image"),
    });
}
