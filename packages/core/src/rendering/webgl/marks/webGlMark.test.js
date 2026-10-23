import { expect, test, vi } from "vitest";

import WebGLMark from "./webGlMark.js";

test("keeps explicit vertex counts for marks without attribute buffers", () => {
    const gl = { bindVertexArray: vi.fn(), bindBuffer: vi.fn() };
    const delegate = new WebGLMark(
        /** @type {any} */ ({}),
        /** @type {any} */ ({ gl })
    );

    // A band ruler is empty until the first pointer event and clears on leave.
    for (const vertexCount of [0, 6, 0, 6]) {
        delegate.updateBufferInfo({
            arrays: {},
            vertexCount,
            allocatedVertices: vertexCount,
        });

        expect(delegate.bufferInfo.attribs).toEqual({});
        expect(delegate.bufferInfo.numElements).toBe(vertexCount);
    }
});

test("fits complete attribute uploads when drawn vertices omit padding", () => {
    /** @type {Map<object, number>} */
    const bufferSizes = new Map();
    let boundBuffer = {};
    const gl = {
        bindVertexArray: vi.fn(),
        createBuffer: () => ({}),
        deleteBuffer: vi.fn(),
        bindBuffer: (
            /** @type {number} */ _target,
            /** @type {object} */ buffer
        ) => {
            boundBuffer = buffer;
        },
        bufferData: (
            /** @type {number} */ _target,
            /** @type {Float32Array} */ data
        ) => {
            bufferSizes.set(boundBuffer, data.byteLength);
        },
        bufferSubData: (
            /** @type {number} */ _target,
            /** @type {number} */ offset,
            /** @type {Float32Array} */ data
        ) => {
            // WebGL rejects this entire upload if its padding exceeds capacity.
            expect(offset + data.byteLength).toBeLessThanOrEqual(
                bufferSizes.get(boundBuffer)
            );
        },
    };
    const delegate = new WebGLMark(
        /** @type {any} */ ({}),
        /** @type {any} */ ({ gl })
    );

    // Spaces reserve text-array capacity without producing drawn glyph vertices.
    for (const [vertexCount, allocatedVertices] of [
        [3, 4],
        [4, 6],
        [2, 4],
    ]) {
        delegate.updateBufferInfo({
            arrays: {
                position: {
                    data: new Float32Array(allocatedVertices),
                    numComponents: 1,
                },
            },
            vertexCount,
            allocatedVertices,
        });
        expect(delegate.bufferInfo.numElements).toBe(vertexCount);
    }
});

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
