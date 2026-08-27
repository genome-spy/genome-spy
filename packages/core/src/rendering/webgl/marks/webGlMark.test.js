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
