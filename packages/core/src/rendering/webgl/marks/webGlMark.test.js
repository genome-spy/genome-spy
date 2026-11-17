import { expect, test, vi } from "vitest";

import WebGLMark from "./webGlMark.js";
import scaleBand from "../../../scales/scaleBand.js";

test("rebinds samplers on every paint and publishes current gap geometry", () => {
    const program = {};
    let currentProgram = {};
    /** @type {Map<string, object>} */
    const samplers = new Map();
    /** @param {string} slot */
    const samplerSetter = (slot) => (/** @type {object} */ texture) => {
        expect(currentProgram).toBe(program);
        samplers.set(slot, texture);
    };
    const scale = Object.assign(
        scaleBand().domain(["A", "B", "C"]).gapPositions([1]).gapWidth(6),
        { type: "band", props: { gapPositions: ["B"], gapWidth: 6 } }
    );
    const resolution = {
        getScale: () => scale,
        getDomainRef: () => ({ get: () => scale.domain() }),
    };
    const domainTexture = {};
    const gapTexture = {};
    const rangeTexture = {};
    const gapCount = vi.fn();
    /** @type {number[][]} */
    const gapGeometry = [];
    const delegate = new WebGLMark(
        /** @type {any} */ ({
            encoders: {
                y: {
                    scale,
                    channelDef: { field: "category", type: "nominal" },
                },
                y2: {
                    scale,
                    channelDef: { field: "category", type: "nominal" },
                },
            },
            unitView: {
                getScaleResolution: () => resolution,
                getEffectiveOpacity: () => 1,
            },
        }),
        /** @type {any} */ ({
            gl: {
                useProgram: (/** @type {object} */ value) => {
                    currentProgram = value;
                },
                enable: () => {},
            },
            rangeTextures: new WeakMap([[scale, rangeTexture]]),
        }),
        /** @type {any} */ ({
            getCategoricalTexture: () => domainTexture,
            getGapTexture: () => gapTexture,
        })
    );
    delegate.programInfo = /** @type {any} */ ({
        program,
        // Secondary channels share primary samplers and have no own setters.
        uniformSetters: {
            uDomainTexture_y: samplerSetter("domain"),
            uGapCuts_y: samplerSetter("gaps"),
            uRangeTexture_y: samplerSetter("range"),
            uGapCount_y: gapCount,
            uGapGeometry_y: (/** @type {Float32Array} */ value) =>
                gapGeometry.push(Array.from(value)),
        },
    });
    delegate.vertexArrayInfo = /** @type {any} */ ({});
    delegate.viewUniformInfo = /** @type {any} */ ({ setters: {} });
    const operations = delegate.prepareRender({});

    for (let pass = 0; pass < 3; pass++) {
        // Another mark or export may replace global bindings between paints.
        currentProgram = {};
        samplers.clear();
        if (pass === 2) {
            scale
                .gapPositions([1, 2])
                .gapWidth(12)
                .viewport({
                    interval: [1, 2],
                    gapRanks: [0.25, 1.75],
                });
        }
        operations.forEach((operation) => operation());
        expect(samplers).toEqual(
            new Map([
                ["domain", domainTexture],
                ["gaps", gapTexture],
                ["range", rangeTexture],
            ])
        );
    }
    expect(gapCount.mock.calls.map(([value]) => value)).toEqual([1, 1, 2]);
    expect(gapGeometry).toEqual([
        [6, 0, 1, 0],
        [6, 0, 1, 0],
        [12, 0.25, 1.75, 1],
    ]);
});

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
