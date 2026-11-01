// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from "vitest";

vi.mock("twgl.js", async (importOriginal) => ({
    ...(await importOriginal()),
    getContext: vi.fn(),
    isWebGL2: () => true,
    addExtensionsToContext: vi.fn(),
    createFramebufferInfo: () => ({
        attachments: /** @type {WebGLTexture[]} */ ([]),
        framebuffer: {},
    }),
    resizeFramebufferInfo: vi.fn(),
}));

const colorTextureMocks = vi.hoisted(() => ({
    createDiscreteColorTexture: vi.fn(() => ({})),
    createDiscreteTexture: vi.fn(() => ({})),
    createInterpolatedColorTexture: vi.fn(() => ({})),
    createSchemeTexture: vi.fn(() => ({})),
}));

vi.mock("./colorUtils.js", () => ({
    ...colorTextureMocks,
}));

import scale from "../../../scale/scale.js";
import { getContext } from "twgl.js";
import WebGLHelper, { createProgram } from "./webGLHelper.js";

beforeEach(() => {
    vi.clearAllMocks();
});

test("quantize textures use the scale's resolved color range", () => {
    // The resolved range samples interpolating schemes at the same points as CPU encoders.
    /** @type {import("../../../spec/scale.js").Scale} */
    const scaleProps = {
        type: "quantize",
        domain: [0, 120],
        scheme: { name: "turbo", count: 5 },
    };
    const quantizeScale = scale(scaleProps);
    quantizeScale.props = scaleProps;
    const helper = Object.create(WebGLHelper.prototype);
    helper.gl = {};
    helper.rangeTextures = new WeakMap();
    helper._ownedTextures = new Set();

    helper.createRangeTexture({
        channel: "color",
        getScale: () => quantizeScale,
    });

    expect(colorTextureMocks.createDiscreteColorTexture).toHaveBeenCalledWith(
        quantizeScale.range(),
        helper.gl,
        quantizeScale.range().length,
        undefined
    );
    expect(colorTextureMocks.createSchemeTexture).not.toHaveBeenCalled();
});

/** Return a context with a successfully linked program unless overridden. */
function programContext() {
    return {
        createProgram: vi.fn(() => ({})),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        isContextLost: vi.fn(() => false),
        getProgramParameter: vi.fn(() => true),
        getProgramInfoLog: vi.fn(() => ""),
        getShaderParameter: vi.fn(() => true),
        getShaderInfoLog: vi.fn(() => ""),
        getShaderSource: vi.fn(() => "void main() {}"),
        deleteShader: vi.fn(),
        deleteProgram: vi.fn(),
    };
}

test("linked programs do not report errors", () => {
    const gl = programContext();
    const status = createProgram(/** @type {any} */ (gl), {}, {});

    expect(status.getProgramErrors()).toBeUndefined();
    expect(gl.deleteProgram).not.toHaveBeenCalled();
});

test("context loss reports its cause without querying shader diagnostics", () => {
    const gl = programContext();
    const status = createProgram(/** @type {any} */ (gl), {}, {});
    gl.isContextLost.mockReturnValue(true);

    expect(status.getProgramErrors()).toMatchObject({
        message: "WebGL context lost during shader initialization.",
    });
    expect(gl.getProgramParameter).not.toHaveBeenCalled();
    expect(gl.getShaderInfoLog).not.toHaveBeenCalled();
});

test.each([null, ""])("failed linking remains an error with log %j", (log) => {
    const gl = programContext();
    gl.getProgramParameter.mockReturnValue(false);
    gl.getProgramInfoLog.mockReturnValue(log);
    const status = createProgram(/** @type {any} */ (gl), {}, {});

    expect(status.getProgramErrors()).toMatchObject({
        message: "Shader program linking failed.",
    });
    expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(status.program);
});

test.each([null, ""])(
    "failed compilation tolerates missing source and log %j",
    (log) => {
        const gl = programContext();
        gl.getProgramParameter.mockReturnValue(false);
        gl.getShaderParameter.mockReturnValue(false);
        gl.getShaderInfoLog.mockReturnValue(log);
        gl.getShaderSource.mockReturnValue(null);
        const status = createProgram(/** @type {any} */ (gl), {}, {});

        expect(status.getProgramErrors()).toMatchObject({
            message: "Shader compilation failed.",
            detail: expect.stringContaining(
                "Error compiling: Shader compilation failed."
            ),
        });
        expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(
            status.program
        );
    }
);

test("shader errors retain their log and numbered source", () => {
    const gl = programContext();
    gl.getProgramParameter.mockReturnValue(false);
    gl.getShaderParameter.mockReturnValueOnce(false);
    gl.getShaderInfoLog.mockReturnValue("ERROR: 0:2: syntax error");
    gl.getShaderSource.mockReturnValue("void main() {\ninvalid;\n}");
    const status = createProgram(/** @type {any} */ (gl), {}, {});

    expect(status.getProgramErrors()).toEqual({
        message: "ERROR: 0:2: syntax error",
        detail: expect.stringContaining(
            "2: invalid;\n\n^^^ ERROR: 0:2: syntax error"
        ),
    });
});

test.each([true, false])(
    "finalize releases its context once (extension available: %j)",
    (available) => {
        const loseContext = vi.fn();
        const gl = {
            getExtension: vi.fn((name) =>
                name === "WEBGL_lose_context" && available
                    ? { loseContext }
                    : null
            ),
            blendFunc: vi.fn(),
            bindFramebuffer: vi.fn(),
            deleteFramebuffer: vi.fn(),
        };
        vi.mocked(getContext).mockReturnValue(/** @type {any} */ (gl));
        const container = document.createElement("div");
        const helper = new WebGLHelper(container, () => ({
            width: 100,
            height: 100,
        }));
        const disposeResources = vi.fn();
        helper.setResourceFinalizer(disposeResources);

        helper.finalize();
        helper.finalize();

        expect(disposeResources).toHaveBeenCalledOnce();
        expect(loseContext).toHaveBeenCalledTimes(available ? 1 : 0);
        expect(
            gl.getExtension.mock.calls.filter(
                ([name]) => name === "WEBGL_lose_context"
            )
        ).toHaveLength(1);
        expect(container.childElementCount).toBe(0);
        if (available) {
            expect(disposeResources).toHaveBeenCalledBefore(loseContext);
        }
    }
);

test("direction textures preserve the bidirectional code", () => {
    /** @type {import("../../../spec/scale.js").Scale} */
    const scaleProps = {
        type: "ordinal",
        domain: ["forward", "reverse", "both"],
        range: ["forward", "reverse", "both"],
    };
    const directionScale = scale(scaleProps);
    directionScale.props = scaleProps;
    const helper = Object.create(WebGLHelper.prototype);
    helper.gl = {};
    helper.rangeTextures = new WeakMap();
    helper._ownedTextures = new Set();

    helper.createRangeTexture({
        channel: "direction",
        getScale: () => directionScale,
    });

    expect(colorTextureMocks.createDiscreteTexture).toHaveBeenCalledWith(
        [0, 1, 2],
        helper.gl,
        3,
        undefined
    );
});
