import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createTexture: vi.fn(),
}));

vi.mock("twgl.js", async (importOriginal) => ({
    ...(await importOriginal()),
    createTexture: mocks.createTexture,
}));

import WebGLRendererResources from "./rendererResources.js";

beforeEach(() => {
    vi.resetAllMocks();
});

test("rejects resource creation after disposal", () => {
    const glHelper = createGlHelper();
    const resources = new WebGLRendererResources(glHelper);

    resources.dispose();

    expect(() => resources.createMark(/** @type {any} */ ({}))).toThrow(
        "WebGL renderer resources have been disposed."
    );
    expect(() =>
        resources.updateScaleResolution(/** @type {any} */ ({}))
    ).toThrow("WebGL renderer resources have been disposed.");
    expect(() => resources.loadFontResource("font.png")).toThrow(
        "WebGL renderer resources have been disposed."
    );
});

test("deletes a font texture when disposed during loading", async () => {
    const texture = /** @type {WebGLTexture} */ ({});
    /** @type {(error?: Error) => void} */
    let finishLoading;
    mocks.createTexture.mockImplementation((gl, options, callback) => {
        finishLoading = callback;
        return texture;
    });
    const glHelper = createGlHelper();
    const resources = new WebGLRendererResources(glHelper);
    const load = resources.loadFontResource("font.png");
    const rejection = expect(load.ready).rejects.toThrow(
        "WebGL renderer resources were disposed while loading a font."
    );

    resources.dispose();
    finishLoading();

    await rejection;
    expect(glHelper.gl.deleteTexture).toHaveBeenCalledOnce();
    expect(glHelper.gl.deleteTexture).toHaveBeenCalledWith(texture);
});

function createGlHelper() {
    return /** @type {any} */ ({
        gl: {
            LINEAR: 9729,
            deleteTexture: vi.fn(),
        },
        createRangeTexture: vi.fn(),
    });
}
