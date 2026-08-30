import { expect, test, vi } from "vitest";

import WebGLMark from "./webGlMark.js";

test("releases retained program and uniform resources idempotently", () => {
    const gl = {
        deleteBuffer: vi.fn(),
        deleteProgram: vi.fn(),
    };
    const delegate = new WebGLMark(
        /** @type {any} */ ({}),
        /** @type {any} */ ({ gl })
    );
    const program = /** @type {WebGLProgram} */ ({});
    const viewUniformBuffer = /** @type {WebGLBuffer} */ ({});
    const markUniformBuffer = /** @type {WebGLBuffer} */ ({});
    delegate.programInfo = /** @type {any} */ ({ program });
    delegate.viewUniformInfo = /** @type {any} */ ({
        buffer: viewUniformBuffer,
    });
    delegate.markUniformInfo = /** @type {any} */ ({
        buffer: markUniformBuffer,
    });

    delegate.dispose();
    delegate.dispose();

    expect(gl.deleteBuffer.mock.calls).toEqual([
        [viewUniformBuffer],
        [markUniformBuffer],
    ]);
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledWith(program);
    expect(() => delegate.initializeGraphics()).toThrow(
        "WebGL mark resources have been disposed."
    );
});

test("removes scale-resolution listeners idempotently", () => {
    const delegate = new WebGLMark(
        /** @type {any} */ ({}),
        /** @type {any} */ ({
            gl: {
                deleteBuffer: vi.fn(),
                deleteProgram: vi.fn(),
            },
        })
    );
    const resolution = /** @type {any} */ ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    const domainListener = vi.fn();
    const rangeListener = vi.fn();

    delegate.registerScaleResolutionListener(
        resolution,
        "domain",
        domainListener
    );
    delegate.registerScaleResolutionListener(
        resolution,
        "range",
        rangeListener
    );
    delegate.dispose();
    delegate.dispose();

    expect(resolution.addEventListener.mock.calls).toEqual([
        ["domain", domainListener],
        ["range", rangeListener],
    ]);
    expect(resolution.removeEventListener.mock.calls).toEqual([
        ["domain", domainListener],
        ["range", rangeListener],
    ]);
});

test("preserves sample facet visibility when preparing its uniform", () => {
    const gl = { uniform2f: vi.fn() };
    const delegate = new WebGLMark(
        /** @type {any} */ ({}),
        /** @type {any} */ ({ gl })
    );
    delegate.programInfo = /** @type {any} */ ({
        uniformSetters: { uSampleFacet: { location: "sample-facet" } },
    });

    expect(
        delegate.prepareSampleFacetRendering({
            sampleFacetRenderingOptions: {
                locSize: { location: 80, size: 30 },
                pixelToUnit: 0.01,
            },
        })
    ).toBe(true);
    expect(gl.uniform2f).toHaveBeenCalledWith("sample-facet", 0.8, 0.3);

    gl.uniform2f.mockClear();
    expect(
        delegate.prepareSampleFacetRendering({
            sampleFacetRenderingOptions: {
                locSize: { location: 101, size: 20 },
                pixelToUnit: 0.01,
            },
        })
    ).toBe(false);
    expect(gl.uniform2f).not.toHaveBeenCalled();
});
