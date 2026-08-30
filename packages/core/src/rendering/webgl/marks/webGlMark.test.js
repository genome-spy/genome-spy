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
